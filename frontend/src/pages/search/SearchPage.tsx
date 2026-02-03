import { useState, useRef, useEffect } from 'react';
import { FileResponseDto, FileType } from '@/types/upload.types';
import { QueryResult } from '@/types/search.types';
import { Collection, CollectionAttachment } from '@/types/collection.types';
import { useSearch } from '@/hooks/useSearch';
import { collectionAPI } from '@/api/collection';
import SearchInput from './components/SearchInput';
import Attachments from '@/components/Attachments';
import Popover from '@/components/Popover';
import SearchResults from './components/SearchResults';
import VideoPreview from './components/VideoPreview';
import ImagePreview from './components/ImagePreview';
import YouTubePlayer from './components/YouTubePlayer';
import FilePickerModal from './components/FilePickerModal';
import CollectionPickerModal from './components/CollectionPickerModal';
import { AlertCircle, Search, Film, Folder, FilePlus } from 'lucide-react';

const SearchPage: React.FC = () => {
    const [attachedFiles, setAttachedFiles] = useState<FileResponseDto[]>([]);
    const [attachedCollections, setAttachedCollections] = useState<CollectionAttachment[]>([]);
    const [selectedResult, setSelectedResult] = useState<QueryResult | undefined>();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [attachmentButtonRef, setAttachmentButtonRef] = useState<HTMLElement | null>(null);

    const searchMutation = useSearch();

    const handleSearch = async (query: string) => {
        // Resolve collection file IDs
        let collectionFileIds: string[] = [];
        try {
            const fileIdPromises = attachedCollections.map(c => collectionAPI.getCollectionFiles(c.id));
            const fileIdArrays = await Promise.all(fileIdPromises);
            collectionFileIds = [...new Set(fileIdArrays.flat())]; // Deduplicate
        } catch (err) {
            console.error('Failed to resolve collection files:', err);
        }

        // Combine file IDs from direct attachments and collections
        const allFileIds = [...new Set([...attachedFiles.map(f => f.id), ...collectionFileIds])];

        searchMutation.mutate({
            query,
            file_ids: allFileIds.length > 0 ? allFileIds : undefined,
        });
    };

    const handleRemoveFile = (fileId: string) => {
        setAttachedFiles(files => files.filter(f => f.id !== fileId));
    };

    const handleRemoveCollection = (collectionId: string) => {
        setAttachedCollections(collections => collections.filter(c => c.id !== collectionId));
    };

    const handleSelectFiles = (files: FileResponseDto[]) => {
        setAttachedFiles(files);
    };

    const handleSelectCollections = (collections: Collection[]) => {
        const collectionAttachments: CollectionAttachment[] = collections.map(c => ({
            id: c.id,
            name: c.name,
            color: c.color,
            fileCount: c._count?.fileCollections || 0,
        }));
        setAttachedCollections(collectionAttachments);
    };

    const handleSceneClick = (result: QueryResult) => {
        setSelectedResult(result);
    };

    const isYouTubeVideo = selectedResult?.file_type === FileType.YOUTUBE_VIDEO || selectedResult?.file_type === 'YOUTUBE_VIDEO';
    const isVideo = selectedResult?.file_type === FileType.VIDEO || selectedResult?.file_type === 'VIDEO';
    const isImage = selectedResult?.file_type === FileType.IMAGE || selectedResult?.file_type === 'IMAGE';
    const youtubeUrl = selectedResult?.file_details?.youtubeUrl;

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
                                onAttachFiles={(ref) => {
                                    setAttachmentButtonRef(ref);
                                    setShowAttachmentMenu(!showAttachmentMenu);
                                }}
                                isLoading={searchMutation.isPending}
                            />

                            {/* Attachments */}
                            {(attachedFiles.length > 0 || attachedCollections.length > 0) && (
                                <div className="mt-4">
                                    <Attachments
                                        files={attachedFiles}
                                        collections={attachedCollections}
                                        onRemoveFile={handleRemoveFile}
                                        onRemoveCollection={handleRemoveCollection}
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
                            {isYouTubeVideo && youtubeUrl && <YouTubePlayer result={selectedResult} youtubeUrl={youtubeUrl} />}
                            {!isYouTubeVideo && isVideo && <VideoPreview result={selectedResult} />}
                            {isImage && <ImagePreview result={selectedResult} />}
                            {!isYouTubeVideo && !isVideo && !isImage && (
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

            {/* Attachment Menu Popover */}
            <Popover
                isOpen={showAttachmentMenu}
                onClose={() => setShowAttachmentMenu(false)}
                trigger={attachmentButtonRef}
                className="w-48 py-1"
            >
                <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left text-text-secondary hover:text-text-primary hover:bg-sidebar-hover"
                    onClick={() => {
                        setIsFilePickerOpen(true);
                        setShowAttachmentMenu(false);
                    }}
                >
                    <FilePlus size={16} />
                    <span>Attach Files</span>
                </button>
                <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left text-text-secondary hover:text-text-primary hover:bg-sidebar-hover"
                    onClick={() => {
                        setIsCollectionPickerOpen(true);
                        setShowAttachmentMenu(false);
                    }}
                >
                    <Folder size={16} />
                    <span>Attach Collections</span>
                </button>
            </Popover>

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelectFiles={handleSelectFiles}
                selectedFileIds={attachedFiles.map(f => f.id)}
            />

            {/* Collection Picker Modal */}
            <CollectionPickerModal
                isOpen={isCollectionPickerOpen}
                onClose={() => setIsCollectionPickerOpen(false)}
                onSelectCollections={handleSelectCollections}
                selectedCollectionIds={attachedCollections.map(c => c.id)}
            />
        </div>
    );
};

export default SearchPage;