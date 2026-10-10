import { queryOptions } from '@tanstack/react-query';
import { getWeightInventory, listWeightInventories } from './weight-inventory.functions';

export const weightInventoriesOptions = queryOptions({ queryKey: ['weight-inventories'], queryFn: () => listWeightInventories() });
export const weightInventoryOptions = (id: string) => queryOptions({ queryKey: ['weight-inventory', id], queryFn: () => getWeightInventory({ data: { id } }), enabled: Boolean(id) });