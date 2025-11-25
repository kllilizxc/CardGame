export type UsageCategory = string;

export class UsageManager {
    private usage: Map<UsageCategory, Map<string, number>> = new Map();

    public recordUsage(category: UsageCategory, key: string, amount: number = 1): void {
        if (!category || !key || amount === 0) {
            return;
        }

        const categoryMap = this.ensureCategoryMap(category);
        categoryMap.set(key, (categoryMap.get(key) ?? 0) + amount);
    }

    public getUsage(category: UsageCategory, key: string): number {
        const categoryMap = this.usage.get(category);
        if (!categoryMap) {
            return 0;
        }
        return categoryMap.get(key) ?? 0;
    }

    public getCategoryUsage(category: UsageCategory): Record<string, number> {
        const categoryMap = this.usage.get(category);
        if (!categoryMap) {
            return {};
        }
        return Array.from(categoryMap.entries()).reduce<Record<string, number>>((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
    }

    public resetCategory(category: UsageCategory): void {
        this.usage.delete(category);
    }

    public resetAll(): void {
        this.usage.clear();
    }

    private ensureCategoryMap(category: UsageCategory): Map<string, number> {
        if (!this.usage.has(category)) {
            this.usage.set(category, new Map());
        }
        return this.usage.get(category)!;
    }
}
