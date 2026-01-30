import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Button from './Button';
import Dropdown from './Dropdown';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    pageSizeOptions?: number[];
    className?: string;
}

const Pagination = ({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [12, 24, 48, 96],
    className = '',
}: PaginationProps) => {
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const showEllipsis = totalPages > 7;

        if (!showEllipsis) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 4) {
                for (let i = 1; i <= 5; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 3) {
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 4; i <= totalPages; i++) {
                    pages.push(i);
                }
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(totalPages);
            }
        }

        return pages;
    };

    if (totalPages <= 1) {
        return null;
    }

    return (
        <div
            className={`flex items-center justify-between gap-4 bg-surface-secondary shadow-lg ${className}`}
        >
            <div className="flex items-center gap-4 text-sm text-text-secondary">
                {/* <span>
                    Showing <span className="font-medium text-text-primary">{startItem}</span> to{' '}
                    <span className="font-medium text-text-primary">{endItem}</span> of{' '}
                    <span className="font-medium text-text-primary">{totalItems}</span> results
                </span> */}
                {onPageSizeChange && (
                    <div className="flex items-center gap-2">
                        <span className="text-text-muted">Show:</span>
                        <Dropdown
                            value={itemsPerPage}
                            onChange={(value) => onPageSizeChange(Number(value))}
                            options={pageSizeOptions.map((size) => ({
                                value: size,
                                label: String(size),
                            }))}
                            className="p-0"
                        />
                        <span className="text-text-muted">per page</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronsLeft className="w-4 h-4" />}
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    aria-label="First page"
                    className='p-2! rounded-full'
                />
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft className="w-4 h-4" />}
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                    className='p-2! rounded-full'
                />

                <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, index) => {
                        if (page === '...') {
                            return (
                                <span
                                    key={`ellipsis-${index}`}
                                    className="px-2 py-1 text-text-muted"
                                >
                                    ...
                                </span>
                            );
                        }

                        return (
                            <Button
                                key={page}
                                variant={currentPage === page ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => onPageChange(page as number)}
                                className='min-w-8 rounded-full'
                            >
                                {page}
                            </Button>
                        );
                    })}
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronRight className="w-4 h-4" />}
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                    className='p-2! rounded-full'
                />
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronsRight className="w-4 h-4" />}
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    aria-label="Last page"
                    className='p-2! rounded-full'
                />
            </div>
        </div>
    );
};

export default Pagination;
