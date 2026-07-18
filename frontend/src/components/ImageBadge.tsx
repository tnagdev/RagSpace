import { Image as ImageIcon } from 'lucide-react';

interface ImageBadgeProps {
    fileName: string;
    thumbnailUrl?: string;
    onClick: (fileId: string) => void;
    fileId: string;
}

const ImageBadge: React.FC<ImageBadgeProps> = ({ fileName, thumbnailUrl, onClick, fileId }) => (
    <button
        onClick={() => onClick(fileId)}
        title={`Preview ${fileName}`}
        className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full align-middle mx-0.5
                   border border-accent-primary/30 hover:border-accent-primary/60
                   bg-bg-secondary hover:bg-accent-primary/10
                   cursor-pointer transition-all duration-150 group max-w-[220px]"
    >
        {/* Thumbnail */}
        <div className="relative w-5 h-5 shrink-0 rounded-full overflow-hidden bg-bg-tertiary">
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={10} className="text-accent-primary" />
                </div>
            )}
        </div>

        {/* File name label */}
        <span className="text-[10px] font-medium text-accent-primary leading-none truncate">
            {fileName}
        </span>
    </button>
);

export default ImageBadge;
