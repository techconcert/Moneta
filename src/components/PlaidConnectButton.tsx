import React, { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Building2, RefreshCw } from 'lucide-react';

interface PlaidConnectButtonProps {
  onSuccess: (public_token: string) => Promise<void>;
}

export const PlaidConnectButton: React.FC<PlaidConnectButtonProps> = ({ onSuccess }) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);

  useEffect(() => {
    const generateToken = async () => {
      try {
        setIsGeneratingToken(true);
        const response = await fetch('/api/plaid/create_link_token', { method: 'POST' });
        const responseText = await response.text();
        
        let data: any = null;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          // Response is not valid JSON (e.g. "Rate exceeded.")
        }

        if (response.ok && data) {
          setLinkToken(data.link_token);
        } else {
          const errorMsg = data?.error || responseText || "Unknown error";
          console.error("Failed to generate link token:", errorMsg);
        }
      } catch (err) {
        console.error("Error generating link token", err);
      } finally {
        setIsGeneratingToken(false);
      }
    };
    generateToken();
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken!,
    onSuccess: (public_token, metadata) => {
      onSuccess(public_token);
    },
    clientName: "Moneta",
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready || isGeneratingToken || !linkToken}
      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isGeneratingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
      <span>{isGeneratingToken ? "Loading Plaid..." : "Via Plaid 🇺🇸"}</span>
    </button>
  );
};
