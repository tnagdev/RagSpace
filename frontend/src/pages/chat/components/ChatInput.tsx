import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Send, Paperclip, Loader2 } from 'lucide-react';

interface ChatInputProps {
    onSendMessage: (message: string) => void;
    onAttachFiles: () => void;
    isLoading?: boolean;
    disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
    onSendMessage,
    onAttachFiles,
    isLoading = false,
    disabled = false,
}) => {
    const [message, setMessage] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || disabled) return;

        onSendMessage(message);
        setMessage('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setMessage(e.target.value);
        // Auto-resize textarea
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <IconButton
                variant="ghost"
                size="md"
                onClick={onAttachFiles}
                disabled={disabled}
                icon={<Paperclip size={20} />}
                className=""
            />

            <div className="flex-1 overflow-hidden w-full px-4 py-2 pr-3 bg-bg-tertiary border-2 rounded-xl 
                             text-white placeholder-text-secondary resize-none overflow-y-auto custom-scrollbar
                             focus:outline-none border-accent-primary/50
                             transition-all duration-200 text-sm leading-6 block
                             [&::-webkit-scrollbar]:w-2
                             [&::-webkit-scrollbar-track]:bg-transparent
                             [&::-webkit-scrollbar-track]:rounded-xl
                             [&::-webkit-scrollbar-thumb]:bg-accent-primary/20
                             [&::-webkit-scrollbar-thumb]:rounded-full
                             [&::-webkit-scrollbar-thumb]:hover:bg-accent-primary/30">
                <textarea
                    value={message}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your media..."
                    disabled={disabled}
                    rows={1}
                    className="w-full custom-scrollbar resize-none outline-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
            </div>

            <IconButton
                variant="gradient"
                size="md"
                onClick={handleSubmit}
                disabled={!message.trim() || disabled || isLoading}
                icon={isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                className=""
            />
        </form>
    );
};

export default ChatInput;
