import { queryOptions } from '@tanstack/react-query';
import { inventorySetupCatalog } from './inventory-setup.functions';
export const inventorySetupOptions = queryOptions({ queryKey: ['inventory-setup-catalog'], queryFn: () => inventorySetupCatalog() });