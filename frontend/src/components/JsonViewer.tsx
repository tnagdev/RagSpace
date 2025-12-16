import type { FC } from 'react';
import ReactJson, { type ReactJsonViewProps } from 'react-json-view'


interface JsonViewerProps extends ReactJsonViewProps {
    className?: string;
}

const JsonViewer: FC<JsonViewerProps> = ({ className, ...props }) => {
    return (
        <div className={className}>
            <ReactJson
                {...props}
            />
        </div>
    );
};

export default JsonViewer;