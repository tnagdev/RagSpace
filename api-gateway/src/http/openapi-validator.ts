import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import Ajv2020, { ErrorObject, ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import type { FieldError } from '@ragspace/shared-ts';
import { ApiError, badRequest, notFound, sendProblem, toProblem } from './problem';

type Json = Record<string, any>;

interface Param {
    name: string;
    in: 'path' | 'query' | 'header';
    required: boolean;
    type: string | undefined;
    validate: ValidateFunction;
}

interface Operation {
    operationId: string;
    method: string;
    pattern: RegExp;
    params: Param[];
    body?: { required: boolean; validate?: ValidateFunction };
}

export interface ValidatedRequest {
    operationId: string;
    params: Record<string, string>;
    query: Record<string, unknown>;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const DOC_ID = 'openapi';
// Raw bodies are verified by the provider signature downstream, not by schema.
const RAW_BODY_OPERATIONS = new Set(['receivePaymentWebhook']);

export class OpenApiValidator {
    private readonly doc: Json;
    private readonly ajv: Ajv2020;
    private readonly operations: Operation[] = [];

    constructor(specText: string) {
        this.doc = parse(specText);
        this.ajv = new Ajv2020({ strict: false, allErrors: true, coerceTypes: false });
        addFormats(this.ajv);
        this.ajv.addFormat('int32', true);
        this.ajv.addFormat('int64', true);
        this.ajv.addSchema({ $id: DOC_ID, components: this.doc.components });

        for (const [path, item] of Object.entries<Json>(this.doc.paths)) {
            const pattern = new RegExp(`^${path.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')}$`);
            for (const method of METHODS) {
                const operation = item[method];
                if (!operation) continue;
                const params = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((p: Json) =>
                    this.param(this.deref(p)),
                );
                this.operations.push({
                    operationId: operation.operationId,
                    method: method.toUpperCase(),
                    pattern,
                    params,
                    body: this.body(operation),
                });
            }
        }
    }

    static fromFile(path: string): OpenApiValidator {
        return new OpenApiValidator(readFileSync(path, 'utf8'));
    }

    middleware = (req: Request, res: Response, next: NextFunction): void => {
        try {
            res.locals.api = this.validate(req);
            next();
        } catch (error) {
            sendProblem(res, toProblem(error));
        }
    };

    validate(req: Request): ValidatedRequest {
        const matches = this.operations.filter((op) => op.pattern.test(req.path));
        if (!matches.length) throw notFound(`No route for ${req.method} ${req.path}`);
        const operation = matches.find((op) => op.method === req.method);
        if (!operation) {
            throw new ApiError(405, 'validation_failed', `${req.method} is not allowed here`);
        }

        const pathParams = operation.pattern.exec(req.path)?.groups ?? {};
        const errors: FieldError[] = [];
        const result: ValidatedRequest = { operationId: operation.operationId, params: {}, query: {} };
        for (const param of operation.params) {
            const raw =
                param.in === 'path'
                    ? decodeURIComponent(pathParams[param.name] ?? '')
                    : param.in === 'query'
                      ? req.query[param.name]
                      : req.header(param.name);
            if (raw === undefined || raw === '') {
                if (param.required) errors.push({ field: param.name, message: 'is required' });
                continue;
            }
            const value = coerce(raw, param.type);
            if (!param.validate(value)) {
                errors.push(...describe(param.validate.errors, param.name));
                continue;
            }
            if (param.in === 'path') result.params[param.name] = value as string;
            if (param.in === 'query') result.query[param.name] = value;
        }

        if (operation.body && !RAW_BODY_OPERATIONS.has(operation.operationId)) {
            const hasBody = req.body !== undefined && Boolean(req.is('application/json'));
            if (!hasBody) {
                if (operation.body.required) errors.push({ field: 'body', message: 'A JSON body is required' });
                else req.body = {};
            } else if (operation.body.validate && !operation.body.validate(req.body)) {
                errors.push(...describe(operation.body.validate.errors));
            }
        }
        if (errors.length) throw badRequest('One or more fields are invalid.', errors);
        return result;
    }

    private param(p: Json): Param {
        const resolved = this.resolve(p.schema);
        return {
            name: p.name,
            in: p.in,
            required: Boolean(p.required),
            type: Array.isArray(resolved.type) ? resolved.type[0] : resolved.type,
            validate: this.ajv.compile(this.rebase(p.schema)),
        };
    }

    private body(operation: Json): Operation['body'] {
        if (!operation.requestBody) return undefined;
        const schema = operation.requestBody.content?.['application/json']?.schema;
        return {
            required: Boolean(operation.requestBody.required),
            validate: schema ? this.ajv.compile(this.rebase(schema)) : undefined,
        };
    }

    private deref(node: Json): Json {
        return node.$ref ? this.deref(this.pointer(node.$ref)) : node;
    }

    private resolve(schema: Json): Json {
        return schema.$ref ? this.resolve(this.pointer(schema.$ref)) : schema;
    }

    private pointer(ref: string): Json {
        return ref
            .slice(2)
            .split('/')
            .reduce((node, key) => node[key.replace(/~1/g, '/').replace(/~0/g, '~')], this.doc);
    }

    private rebase(schema: Json): Json {
        return JSON.parse(JSON.stringify(schema).replace(/"\$ref":"#\//g, `"$ref":"${DOC_ID}#/`));
    }
}

function coerce(raw: unknown, type: string | undefined): unknown {
    const text = Array.isArray(raw) ? raw.join(',') : String(raw);
    if (type === 'array') return text.split(',').filter(Boolean);
    if (type === 'integer' && /^-?\d+$/.test(text)) return Number(text);
    if (type === 'boolean' && (text === 'true' || text === 'false')) return text === 'true';
    return text;
}

function describe(errors: ErrorObject[] | null | undefined, prefix = ''): FieldError[] {
    return (errors ?? [])
        .filter((error) => !['oneOf', 'anyOf', 'if'].includes(error.keyword))
        .slice(0, 20)
        .map((error) => {
            const path = error.instancePath
                .split('/')
                .filter(Boolean)
                .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`))
                .join('');
            const leaf = (error.params as Json).missingProperty ?? (error.params as Json).additionalProperty;
            const field = `${prefix}${path}${leaf ? `.${leaf}` : ''}`.replace(/^\./, '') || prefix || 'body';
            const message = error.keyword === 'additionalProperties' ? 'is not allowed' : (error.message ?? 'is invalid');
            return { field, message };
        });
}
