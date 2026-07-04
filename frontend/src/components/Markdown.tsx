import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import TimestampBadge from '@/components/TimestampBadge';

interface TimestampSource {
    start_time?: number | null;
    thumbnail_url?: string | null;
}

interface MarkdownProps {
    content: string;
    className?: string;
    onTimestampClick?: (seconds: number) => void;
    searchResults?: TimestampSource[];
}

// Matches (Xs), (Xs - Ys), ((Xs - Ys)) — handles decimals, single or double parens.
// Group 1 = start seconds, group 2 = end seconds (optional).
const SEEK_PATTERN = /\({1,2}(\d+(?:\.\d+)?)s?(?:\s*[-–—]\s*(\d+(?:\.\d+)?)s?)?\){1,2}/g;

function injectTimestampCodes(content: string): string {
    return content.replace(SEEK_PATTERN, (match, startSecs, endSecs) => {
        const key = endSecs ? `${startSecs}:${endSecs}` : startSecs;
        return `\`@@seek:${key}@@${match}\``;
    });
}

function findThumbnail(results: TimestampSource[] | undefined, seconds: number): string | undefined {
    if (!results?.length) return undefined;
    let best: TimestampSource | undefined;
    let bestDist = 30; // max 30s tolerance
    for (const r of results) {
        if (r.start_time == null) continue;
        const d = Math.abs(r.start_time - seconds);
        if (d < bestDist) { bestDist = d; best = r; }
    }
    return best?.thumbnail_url ?? undefined;
}

const customTheme = {
    ...oneDark,
    'pre[class*="language-"]': {
        ...oneDark['pre[class*="language-"]'],
        background: 'var(--color-bg-secondary)',
        margin: 0,
        padding: '1rem',
        borderRadius: '0.5rem',
    },
    'code[class*="language-"]': {
        ...oneDark['code[class*="language-"]'],
        background: 'transparent',
    },
};

const CopyButton = ({ code }: { code: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [code]);

    return (
        <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 rounded bg-bg-tertiary/80 hover:bg-bg-tertiary
                       text-text-secondary hover:text-text-primary transition-all duration-200"
            title={copied ? 'Copied!' : 'Copy code'}
        >
            {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
    );
};

const Markdown: React.FC<MarkdownProps> = ({ content, className = '', onTimestampClick, searchResults }) => {
    const processedContent = onTimestampClick ? injectTimestampCodes(content) : content;

    return (
        <div className={`markdown-content ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Code blocks — also intercepts @@seek: timestamp tokens
                    code({ className, children, ...props }) {
                        const codeString = String(children).replace(/\n$/, '');

                        // Timestamp token injected by injectTimestampCodes
                        if (codeString.startsWith('@@seek:') && onTimestampClick) {
                            const sepIdx = codeString.indexOf('@@', 7);
                            const timePart = codeString.slice(7, sepIdx);
                            const colonIdx = timePart.indexOf(':');
                            const seconds = colonIdx !== -1
                                ? parseFloat(timePart.slice(0, colonIdx))
                                : parseFloat(timePart);
                            const endSeconds = colonIdx !== -1
                                ? parseFloat(timePart.slice(colonIdx + 1))
                                : undefined;
                            return (
                                <TimestampBadge
                                    seconds={seconds}
                                    endSeconds={endSeconds}
                                    thumbnailUrl={findThumbnail(searchResults, seconds)}
                                    onClick={onTimestampClick}
                                />
                            );
                        }

                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match && !codeString.includes('\n');

                        if (isInline) {
                            return (
                                <code
                                    className="px-1.5 py-0.5 rounded bg-bg-secondary text-accent-primary
                                           font-mono text-sm border border-border/50"
                                    {...props}
                                >
                                    {children}
                                </code>
                            );
                        }

                        return (
                            <div className="relative group my-3">
                                <CopyButton code={codeString} />
                                <SyntaxHighlighter
                                    style={customTheme}
                                    language={match?.[1] || 'text'}
                                    PreTag="div"
                                    className="bg-bg-secondary! rounded-lg! border! border-border/50!
                                           text-sm custom-scrollbar"
                                    showLineNumbers={codeString.split('\n').length > 3}
                                    lineNumberStyle={{
                                        color: 'var(--color-text-secondary)',
                                        opacity: 0.5,
                                        minWidth: '2.5em',
                                        paddingRight: '1em',
                                    }}
                                >
                                    {codeString}
                                </SyntaxHighlighter>
                            </div>
                        );
                    },

                    h1: ({ children }) => (
                        <h1 className="text-2xl font-bold text-text-primary mt-6 mb-3 first:mt-0">{children}</h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-xl font-semibold text-text-primary mt-5 mb-2.5 first:mt-0">{children}</h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-lg font-semibold text-text-primary mt-4 mb-2 first:mt-0">{children}</h3>
                    ),
                    h4: ({ children }) => (
                        <h4 className="text-base font-semibold text-text-primary mt-3 mb-1.5 first:mt-0">{children}</h4>
                    ),

                    p: ({ children }) => (
                        <p className="text-text-primary leading-relaxed mb-3 last:mb-0">{children}</p>
                    ),

                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-primary hover:text-accent-secondary underline
                                   underline-offset-2 transition-colors duration-200"
                        >
                            {children}
                        </a>
                    ),

                    ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 mb-3 text-text-primary pl-2">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-1 mb-3 text-text-primary pl-2">{children}</ol>
                    ),
                    li: ({ children }) => (
                        <li className="text-text-primary leading-relaxed">{children}</li>
                    ),

                    blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-accent-primary/50 pl-4 py-2 my-3
                                           bg-bg-secondary/50 rounded-r-lg text-text-secondary italic">
                            {children}
                        </blockquote>
                    ),

                    hr: () => <hr className="my-6 border-border" />,

                    table: ({ children }) => (
                        <div className="overflow-x-auto my-4 custom-scrollbar">
                            <table className="min-w-full border border-border rounded-lg overflow-hidden">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-bg-secondary">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
                    tr: ({ children }) => (
                        <tr className="hover:bg-bg-tertiary/50 transition-colors">{children}</tr>
                    ),
                    th: ({ children }) => (
                        <th className="px-4 py-2.5 text-left text-sm font-semibold text-text-primary border-b border-border">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="px-4 py-2.5 text-sm text-text-secondary">{children}</td>
                    ),

                    strong: ({ children }) => (
                        <strong className="font-semibold text-text-primary">{children}</strong>
                    ),
                    em: ({ children }) => <em className="italic text-text-primary">{children}</em>,
                    del: ({ children }) => <del className="line-through text-text-secondary">{children}</del>,

                    img: ({ src, alt }) => (
                        <img
                            src={src}
                            alt={alt || ''}
                            className="max-w-full h-auto rounded-lg my-3 border border-border"
                            loading="lazy"
                        />
                    ),
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
};

export default Markdown;
