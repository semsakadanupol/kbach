import type { PackageManager } from '../pm';

export interface InitFlowOptions {
  root: string;
  pm: PackageManager;
  dryRun: boolean;
  yes: boolean;
}
