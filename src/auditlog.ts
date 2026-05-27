import { DatabaseSync } from 'node:sqlite';

export function writeAudit(
    db: DatabaseSync,
    entity: string,
    entityId: number,
    action: 'create' | 'update' | 'delete',
    oldValue: unknown,
    newValue: unknown,
    changedBy: number | undefined
): void {
    const oldStr = oldValue !== null && oldValue !== undefined ? JSON.stringify(oldValue) : null;
    const newStr = newValue !== null && newValue !== undefined ? JSON.stringify(newValue) : null;
    db.prepare(
        `
        INSERT INTO audit_log (entity, entity_id, action, old_value, new_value, changed_by)
        VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(entity, entityId, action, oldStr as string, newStr as string, changedBy ?? null);
}
