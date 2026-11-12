import React from 'react';
import { TwinStateSnapshot } from '../../types';

export interface FeatureWorkbenchPlugin {
  id: string;
  label: string;
  Component: React.FC<{ snapshot: TwinStateSnapshot; onRefresh: () => void }>;
}

// Auto-discover any feature plugin modules placed in ./features/*.tsx so 5–10
// engineers can build PRD-01..PRD-10 panels concurrently with zero merge conflicts on App.tsx.
const modules = import.meta.glob<{ plugin?: FeatureWorkbenchPlugin }>('./features/*.tsx', {
  eager: true,
});

export const DISCOVERED_FEATURE_PLUGINS: FeatureWorkbenchPlugin[] = Object.values(modules)
  .map((m) => m.plugin)
  .filter((p): p is FeatureWorkbenchPlugin => Boolean(p && p.id && p.Component));
