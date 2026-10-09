import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatKeys, useGreeting } from '@/hooks/useChat';
import { Sparkles, RefreshCw } from 'lucide-react';


/** Typewriter effect — reveals `target` one character at a time */
function useTypewriter(target: string, speed = 28) {
    const [displayed, setDisplayed] = useState('');
    const frame = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!target) { setDisplayed(''); return; }
        setDisplayed('');
        let i = 0;

        const tick = () => {
            i++;
            setDisplayed(target.slice(0, i));
            if (i < target.length) {
                frame.current = setTimeout(tick, speed);
            }
        };

        frame.current = setTimeout(tick, speed);
        return () => { if (frame.current) clearTimeout(frame.current); };
    }, [target, speed]);

    const done = displayed.length === target.length && target.length > 0;
    return { displayed, done };
}

export function AIGreeting() {
    const queryClient = useQueryClient();

    const { data, isFetching } = useGreeting();

    const greeting = data ?? '';
    const { displayed, done } = useTypewriter(greeting);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: chatKeys.greeting() });
    };

    // Nothing to show while the very first fetch is in flight
    if (!greeting && isFetching) return null;
    if (!greeting) return null;

    return (
        <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Icon */}
            <span
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
                style={{
                    background: 'color-mix(in srgb, var(--color-accent-primary) 14%, transparent)',
                }}
            >
                <Sparkles className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} />
            </span>

            {/* Typewriter text */}
            <span
                className="text-xs font-medium leading-snug line-clamp-2"
                style={{ color: 'var(--color-text-secondary)' }}
            >
                {displayed}
                {!done && (
                    <span
                        className="inline-block w-0.5 h-3 ml-0.5 align-middle animate-pulse rounded-sm"
                        style={{ background: 'var(--color-accent-primary)' }}
                    />
                )}
            </span>

            {/* Refresh — only visible once typing finishes */}
            {done && !isFetching && (
                <button
                    onClick={refresh}
                    title="Regenerate greeting"
                    className="shrink-0 p-1 rounded-md transition-colors duration-100"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--color-accent-primary)';
                        (e.currentTarget as HTMLElement).style.background =
                            'color-mix(in srgb, var(--color-accent-primary) 10%, transparent)';
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)';
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}
