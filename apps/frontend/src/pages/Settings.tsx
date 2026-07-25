import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AiTab } from './settings/AiTab';
import { ProfileTab } from './settings/ProfileTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { McpTab } from './settings/McpTab';
import { AccountTab } from './settings/AccountTab';

type Tab = 'ai' | 'profile' | 'appearance' | 'mcp' | 'account';

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'ai', label: 'Modèle IA', emoji: '🤖' },
  { id: 'profile', label: 'Profil & attentes', emoji: '🧭' },
  { id: 'mcp', label: 'Recherche Web (MCP)', emoji: '🌐' },
  { id: 'appearance', label: 'Apparence', emoji: '🎨' },
  { id: 'account', label: 'Compte & sécurité', emoji: '🔒' },
];

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('ai');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Paramètres</h1>
        <p className="text-secondary mt-1">Configurez votre IA, votre profil et vos préférences.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id ? 'btn-primary !py-2 !px-4 text-sm' : 'btn-ghost !py-2 !px-4 text-sm'
            }
          >
            <span aria-hidden>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          {tab === 'ai' && <AiTab />}
          {tab === 'profile' && <ProfileTab />}
          {tab === 'mcp' && <McpTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'account' && <AccountTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
