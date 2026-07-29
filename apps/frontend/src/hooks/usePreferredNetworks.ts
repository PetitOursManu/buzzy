import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../lib/api';
import type { Network } from '../lib/types';

/**
 * Réseaux retenus dans les Paramètres (onglet « Profil »).
 *
 * Ce sont les seuls réseaux pour lesquels une description est rédigée lors de
 * la découverte d'événements. Les calendriers s'y limitent donc aussi : on
 * évite ainsi les publications sans description, faute de texte disponible
 * pour un réseau jamais configuré.
 */
export function usePreferredNetworks() {
  const query = useQuery({ queryKey: ['profile'], queryFn: settingsApi.getProfile });
  const networks = (query.data?.preferredNetworks ?? []) as Network[];
  return {
    networks,
    loading: query.isLoading,
    /** Aucun réseau retenu dans les Paramètres : rien ne peut être publié. */
    isEmpty: !query.isLoading && networks.length === 0,
  };
}
