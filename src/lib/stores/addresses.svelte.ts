// Persisted address list. Both user and agent can add/edit/delete.
// Used by the checkout flow: agent shows address panel, user selects or adds.

import * as persist from "./persistence";

export interface Address {
  id: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  streetAddress: string;
  city: string;
  notes?: string;
  isDefault?: boolean;
  createdAt: number;
}

const STORE_ID = "addresses";
const VERSION = 1;

function loadAddresses(): Address[] {
  const raw = persist.load<unknown[]>(STORE_ID, VERSION, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is Address => {
    if (!a || typeof a !== "object") return false;
    const obj = a as Record<string, unknown>;
    return typeof obj.recipientName === "string" && typeof obj.city === "string";
  }).map((a) => ({
    id: typeof a.id === "string" ? a.id : crypto.randomUUID(),
    label: a.label ?? "Address",
    recipientName: a.recipientName,
    recipientPhone: a.recipientPhone ?? "",
    streetAddress: a.streetAddress ?? "",
    city: a.city,
    notes: a.notes,
    isDefault: a.isDefault ?? false,
    createdAt: a.createdAt ?? Date.now(),
  }));
}

class AddressStore {
  addresses = $state<Address[]>([]);

  constructor() {
    if (typeof window !== "undefined") this.addresses = loadAddresses();
  }

  private save() {
    persist.save(STORE_ID, VERSION, this.addresses);
  }

  add(data: Omit<Address, "id" | "createdAt">): string {
    const id = crypto.randomUUID();
    const addr: Address = { ...data, id, createdAt: Date.now() };
    this.addresses = [...this.addresses, addr];
    this.save();
    return id;
  }

  update(id: string, data: Partial<Address>) {
    this.addresses = this.addresses.map(a => a.id === id ? { ...a, ...data } : a);
    this.save();
  }

  remove(id: string) {
    this.addresses = this.addresses.filter(a => a.id !== id);
    this.save();
  }

  clone(id: string): string | null {
    const orig = this.addresses.find(a => a.id === id);
    if (!orig) return null;
    const newId = crypto.randomUUID();
    const clone: Address = {
      ...orig, id: newId, label: `${orig.label} (copy)`,
      createdAt: Date.now(), isDefault: false,
    };
    this.addresses = [...this.addresses, clone];
    this.save();
    return newId;
  }

  setDefault(id: string) {
    this.addresses = this.addresses.map(a => ({ ...a, isDefault: a.id === id }));
    this.save();
  }

  get default(): Address | null {
    return this.addresses.find(a => a.isDefault) ?? this.addresses[0] ?? null;
  }
}

const instance = new AddressStore();
export function useAddresses() { return instance; }
