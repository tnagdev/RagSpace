import { useState } from 'react';
import Tabs, { type TabConfig } from '@/components/Tabs';
import { BillingSettings } from './components/BillingSettings';
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
        component: (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
                <h2 className="text-xl font-semibold mb-4">Account Settings</h2>
                <p className="text-gray-400">Account settings coming soon...</p>
            </div>
        ),
    },
    {
        label: 'Notifications',
        value: 'notifications',
        component: (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
                <h2 className="text-xl font-semibold mb-4">Notification Preferences</h2>
                <p className="text-gray-400">Notification settings coming soon...</p>
            </div>
        ),
    },
    {
        label: 'Security',
        value: 'security',
        component: (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
                <h2 className="text-xl font-semibold mb-4">Security Options</h2>
                <p className="text-gray-400">Security settings coming soon...</p>
            </div>
        ),
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
