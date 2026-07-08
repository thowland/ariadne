/**
 * Core domain types. Populated incrementally: Sprint 0 lands the primitives;
 * Sprint 1 adds the full entity model (Project, Task, FileEntry, Settings).
 */

/** Calendar date in ISO `YYYY-MM-DD` form, always local-timezone semantics. */
export type IsoDate = string;
