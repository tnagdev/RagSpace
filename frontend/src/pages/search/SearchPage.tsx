import { useState } from 'react';
import { FileResponseDto, FileType } from '@/types/upload.types';
import { QueryResult } from '@/types/search.types';
import { useSearch } from '@/hooks/useSearch';
import SearchInput from './components/SearchInput';
import FileAttachments from './components/FileAttachments';
import SearchResults from './components/SearchResults';
import VideoPreview from './components/VideoPreview';
import ImagePreview from './components/ImagePreview';
import FilePickerModal from './components/FilePickerModal';
import { AlertCircle, Search, Film } from 'lucide-react';

const SearchPage: React.FC = () => {
    const [attachedFiles, setAttachedFiles] = useState<FileResponseDto[]>([]);
    const [selectedResult, setSelectedResult] = useState<QueryResult | undefined>();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

    const searchMutation = useSearch();

    const handleSearch = (query: string) => {
        const fileIds = attachedFiles.map(f => f.id);
        searchMutation.mutate({
            query,
            file_ids: fileIds.length > 0 ? fileIds : undefined,
            top_k: 20,
            text_weight: 0.5,
            image_weight: 0.5,
            use_dynamic_retrieval: true,
            adaptive_scoring: true,
            enable_query_expansion: true,
            use_enhanced: true,
        });
    };

    const handleRemoveFile = (fileId: string) => {
        setAttachedFiles(files => files.filter(f => f.id !== fileId));
    };

    const handleSelectFiles = (files: FileResponseDto[]) => {
        setAttachedFiles(files);
    };

    const handleSceneClick = (result: QueryResult) => {
        setSelectedResult(result);
    };

    const isVideo = selectedResult?.file_type === FileType.VIDEO || selectedResult?.file_type === 'VIDEO';
    const isImage = selectedResult?.file_type === FileType.IMAGE || selectedResult?.file_type === 'IMAGE';

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex gap-6 min-h-0">
                {/* Left Panel - Search Input & Results */}
                <div className='flex flex-col w-1/2 overflow-y-auto custom-scrollbar pr-2'>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-1">
                                Search
                            </h1>
                            <p className="text-sm text-text-secondary">
                                Search through your media library to find relevant results
                            </p>
                        </div>
                    </div>
                    <div className="">
                        {/* Search Input - Sticky */}
                        <div className="z-10 pb-4">
                            <SearchInput
                                onSearch={handleSearch}
                                onAttachFiles={() => setIsFilePickerOpen(true)}
                                isLoading={searchMutation.isPending}
                            />

                            {/* File Attachments */}
                            {attachedFiles.length > 0 && (
                                <div className="mt-4">
                                    <FileAttachments
                                        files={attachedFiles}
                                        onRemoveFile={handleRemoveFile}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Results */}
                        <div>
                            {searchMutation.isError && (
                                <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger flex items-start gap-3">
                                    <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-sm font-medium text-danger">Search Error</div>
                                        <div className="text-xs text-text-secondary mt-0.5">
                                            {searchMutation.error?.message || 'Failed to perform search. Please try again.'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {searchMutation.data ? (
                                <SearchResults
                                    results={searchMutation.data.results}
                                    onSceneClick={handleSceneClick}
                                    selectedResult={selectedResult}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-64">
                                    <div className="text-center">
                                        <Search size={48} className="mx-auto mb-3 text-text-muted opacity-50" strokeWidth={1.5} />
                                        <p className="text-text-secondary mb-1">Start searching</p>
                                        <p className="text-sm text-text-muted">
                                            Enter a query to find scenes in your media
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Vertical Separator */}
                <div className="w-px bg-border-input flex-shrink-0"></div>

                {/* Right Panel - Preview */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {selectedResult ? (
                        <div>
                            {isVideo && <VideoPreview result={selectedResult} />}
                            {isImage && <ImagePreview result={selectedResult} />}
                            {!isVideo && !isImage && (
                                <div className="flex items-center justify-center h-64">
                                    <div className="text-center">
                                        <AlertCircle size={48} className="mx-auto mb-3 text-text-muted opacity-50" />
                                        <p className="text-text-muted">Unsupported file type</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <Film size={48} className="mx-auto mb-3 text-text-muted opacity-50" strokeWidth={1.5} />
                                <p className="text-text-secondary mb-1">No preview selected</p>
                                <p className="text-sm text-text-muted">
                                    Select a result to view content and details
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelectFiles={handleSelectFiles}
                selectedFileIds={attachedFiles.map(f => f.id)}
            />
        </div>
    );
};

export default SearchPage;