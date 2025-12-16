import { twMerge } from "tailwind-merge";

export interface TableProps<T> {
    data: T[];
    columns?: TableColumn<T>[];
    className?: string;
    tableClassName?: string;
    headerClassName?: string;
    maxCols?: number;
    onRowClick?: (row: T) => void;
}

export interface TableColumn<T> {
    accessor?: keyof T;
    // label: string;
    label: React.ReactNode;
    icon?: React.ReactNode;
    cellRenderer?: (row: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    className?: string;
}

export function Table({ data, columns, className, tableClassName, headerClassName, onRowClick, maxCols = 5 }: TableProps<any>) {
    const tableStyle = {}// maxCols ? { maxHeight: `${(maxCols + 1) * 27}px` } : {};

    return (
        <div className={twMerge('overflow-auto relative h-full bg-white rounded-2xl shadow-sm', className)} style={tableStyle}>
            <table className={twMerge("table p-0 w-full", tableClassName)}>
                <thead className={headerClassName}>
                    <tr className="bg-white border-b border-gray-200">
                        {columns?.map((column, index) => (
                            <th key={(column.accessor || '' + index) as string} className={twMerge(
                                'font-medium text-md text-left p-6 text-[#E74C3C]',
                                column.align === 'right' && 'text-right',
                                column.align === 'center' && 'text-center',
                                column.className
                            )}>
                                <div className="flex items-center gap-2">
                                    {column.icon}
                                    <span>{column.label}</span>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50 border-b border-gray-200" onClick={() => onRowClick?.(row)}>
                            {columns?.map((column, index) => (
                                <td key={(column.accessor || '' + index) as string} className={twMerge(
                                    'font-normal text-md text-left p-6',
                                    column.align === 'right' && 'text-right',
                                    column.align === 'center' && 'text-center',
                                    column.className
                                )}>
                                    {column.cellRenderer?.(row) || (column.accessor && row[column.accessor])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
