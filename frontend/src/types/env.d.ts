/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_AZURE_AD_CLIENT_ID: string;
    readonly VITE_AZURE_AD_TENANT_ID: string;
    readonly VITE_AZURE_AD_REDIRECT_URI: string;
    readonly VITE_AZURE_AD_AUTHORITY: string;
    readonly VITE_APP_NAME: string;
    readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

export { };
