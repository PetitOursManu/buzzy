import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader, Tabs, type TabOption } from '../components/ui';
import { AiTab } from './settings/AiTab';
import { ProfileTab } from './settings/ProfileTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { McpTab } from './settings/McpTab';
import { AccountTab } from './settings/AccountTab';
import { DiagnosticsTab } from './settings/DiagnosticsTab';

type Tab = 'diagnostics' | 'ai' | 'profile' | 'mcp' | 'appearance' | 'account';

const TABS: TabOption<Tab>[] = [
  { value: 'diagnostics', label: 'Diagnostic', icon: 'shield' },
  { value: 'ai', label: 'Modèle IA', icon: 'cpu' },
  { value: 'profile', label: 'Profil & réseaux', icon: 'user' },
  { value: 'mcp', label: 'Recherche web', icon: 'network' },
  { value: 'appearance', label: 'Apparence', icon: 'palette' },
  { value: 'account', label: 'Compte', icon: 'lock' },
];

export function SettingsPage() {
  // Le diagnostic en premier : c'est la page qui répond à « qu'est-ce qu'il me
  // reste à faire ? », la question de tout nouvel arrivant.
  const [tab, setTab] = useState<Tab>('diagnostics');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Paramètres"
        description="Configurez votre fournisseur IA, votre profil éditorial et la recherche web."
      />

      <Tabs options={TABS} value={tab} onChange={setTab} ariaLabel="Sections des paramètres" />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'diagnostics' && <DiagnosticsTab onGoToTab={(t) => setTab(t as Tab)} />}
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
