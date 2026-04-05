import Tabs, { type TabConfig } from '@/components/Tabs';
import { BillingSettings } from './components/BillingSettings';
import { AccountSettings } from './components/AccountSettings';
import { Settings as SettingsIcon } from 'lucide-react';

const TAB_CONFIG: TabConfig[] = [
    {
        label: 'Billing & Usage',
        value: 'billing',
        component: <BillingSettings />,
    },
    {
        label: 'Account',
        value: 'account',
        component: <AccountSettings />,
    },
];

export const Settings = () => {
    return (
        <div className="min-h-screen">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-2">
                        <SettingsIcon className="w-6 h-6 text-purple-500" />
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Settings
                        </h1>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs
                    tabConfig={TAB_CONFIG}
                    defaultTab="billing"
                    variant="underline"
                    size="sm"
                />
            </div>
        </div>
    );
};
