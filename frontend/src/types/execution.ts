
export enum ExecutionStatus {
    AI_COMPLETE = 'AI_COMPLETE',
    SCRAPING = 'SCRAPING',
    QUEUED = 'QUEUED',
    AI = 'AI',
    SCRAPING_COMPLETED = 'SCRAPING_COMPLETED',
    FAILED = 'FAILED',
}


export enum ExecutionStatusLabel {
    AI_COMPLETE = 'AI Complete',
    SCRAPING = 'Scraping',
    QUEUED = 'Queued',
    AI = 'AI',
    SCRAPING_COMPLETED = 'Scraping Completed',
    FAILED = 'Failed',
}

export interface Execution {
    id: string;
    name: string;
    date: string;
    status: ExecutionStatus;
}

export interface ExecutionLog {
    date: string;
    message: string;
    source: string;
    type: 'INFO' | 'ERROR' | 'WARNING';
    status: ExecutionStatus;
}

export const ExecutionStatusClassMap: Record<ExecutionStatus, string> = {
    [ExecutionStatus.AI_COMPLETE]: 'bg-success text-success',
    [ExecutionStatus.SCRAPING_COMPLETED]: 'bg-blue-100 text-blue-800',
    [ExecutionStatus.FAILED]: 'bg-red-100 text-red-800',
    [ExecutionStatus.QUEUED]: 'bg-yellow-100 text-yellow-800',
    [ExecutionStatus.SCRAPING]: 'bg-purple-100 text-purple-800',
    [ExecutionStatus.AI]: 'bg-indigo-100 text-indigo-800',
}