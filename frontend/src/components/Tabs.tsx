import React, { useState } from 'react';
import { twMerge } from 'tailwind-merge';

export interface TabConfig {
    label: string;
    value: string;
    component: React.ReactNode;
    disabled?: boolean;
}

export interface TabsProps {
    tabConfig: TabConfig[];
    onTabChange?: (value: string) => void;
    defaultTab?: string;
    className?: string;
    tabClassName?: string;
    tabContentClassName?: string;
    variant?: 'default' | 'pills' | 'underline';
    size?: 'sm' | 'md' | 'lg';
}

const Tabs: React.FC<TabsProps> = ({
    tabConfig,
    onTabChange,
    defaultTab,
    className,
    tabClassName,
    tabContentClassName,
    variant = 'default',
    size = 'md',
}) => {
    const [activeTab, setActiveTab] = useState<string>(
        defaultTab || tabConfig[0]?.value || ''
    );

    const handleTabChange = (value: string) => {
        const tab = tabConfig.find(t => t.value === value);
        if (!tab?.disabled) {
            setActiveTab(value);
            onTabChange?.(value);
        }
    };

    const getSizeClasses = () => {
        switch (size) {
            case 'sm':
                return 'py-2 px-3 text-sm first:pl-0 last:pr-0';
            case 'lg':
                return 'py-4 px-6 text-lg first:pl-0 last:pr-0';
            default:
                return 'py-3 px-4 text-base first:pl-0 last:pr-0';
        }
    };

    const getTabClasses = (isActive: boolean, disabled: boolean) => {
        const baseClasses = `${getSizeClasses()} font-bold transition-colors cursor-pointer`;

        if (disabled) {
            return `${baseClasses} opacity-50 cursor-not-allowed text-gray-400`;
        }

        switch (variant) {
            case 'pills':
                return isActive
                    ? `${baseClasses} bg-primary text-white rounded-lg`
                    : `${baseClasses} text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg`;

            case 'underline':
                return isActive
                    ? `${baseClasses} text-primary`
                    : `${baseClasses} text-gray-600 hover:text-gray-800`;

            default:
                return isActive
                    ? `${baseClasses} text-primary`
                    : `${baseClasses} text-gray-600 hover:text-gray-800`;
        }
    };

    const getContainerClasses = () => {
        switch (variant) {
            case 'pills':
                return 'flex gap-2 p-1 bg-gray-100 rounded-lg';
            case 'underline':
                return 'flex';
            default:
                return 'flex';
        }
    };

    const activeTabContent = tabConfig.find(tab => tab.value === activeTab)?.component;

    return (
        <div className={twMerge('w-full', className)}>
            <div className={getContainerClasses()}>
                {tabConfig.map((tab) => (
                    <button
                        key={tab.value}
                        onClick={() => handleTabChange(tab.value)}
                        disabled={tab.disabled}
                        className={twMerge(
                            getTabClasses(activeTab === tab.value, !!tab.disabled),
                            tabClassName
                        )}
                        aria-selected={activeTab === tab.value}
                        role="tab"
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div
                className={twMerge('mt-4', tabContentClassName)}
                role="tabpanel"
            >
                {activeTabContent}
            </div>
        </div>
    );
};

export default Tabs;