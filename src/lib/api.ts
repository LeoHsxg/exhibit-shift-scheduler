import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { sortSlots, type Availability, type ShiftEvent, type Slot } from './schedule';

// 所有 Firestore 讀寫都集中在這裡

const eventRef = (id: string) => doc(db, 'events', id);
const availabilityRef = (eventId: string, name: string) => doc(db, 'events', eventId, 'availability', name);

function toEvent(id: string, data: Record<string, unknown>): ShiftEvent {
  return {
    id,
    title: (data.title as string) ?? '',
    dates: [...((data.dates as string[]) ?? [])].sort(),
    slots: sortSlots((data.slots as Slot[]) ?? []),
    isOpen: Boolean(data.isOpen),
    createdAt: data.createdAt as ShiftEvent['createdAt'],
  };
}

// ── 助教端 ──

export async function fetchEvent(id: string): Promise<ShiftEvent | null> {
  const snap = await getDoc(eventRef(id));
  return snap.exists() ? toEvent(snap.id, snap.data()) : null;
}

export async function fetchAvailability(eventId: string, name: string): Promise<string[] | null> {
  const snap = await getDoc(availabilityRef(eventId, name));
  return snap.exists() ? ((snap.data().slots as string[]) ?? []) : null;
}

export async function saveAvailability(eventId: string, name: string, slots: string[]) {
  await setDoc(availabilityRef(eventId, name), { slots: [...slots].sort(), updatedAt: serverTimestamp() });
}

// ── 管理端 ──

export async function checkIsAdmin(email: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'admins', email))).exists();
  } catch {
    return false;
  }
}

export function watchEvents(onChange: (events: ShiftEvent[]) => void, onError: (e: Error) => void) {
  const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => toEvent(d.id, d.data()))), onError);
}

export function watchAvailability(
  eventId: string,
  onChange: (list: Availability[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    collection(db, 'events', eventId, 'availability'),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ name: d.id, slots: (d.data().slots as string[]) ?? [], updatedAt: d.data().updatedAt }))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
      ),
    onError,
  );
}

export async function createEvent(data: Pick<ShiftEvent, 'title' | 'dates' | 'slots'>): Promise<string> {
  const ref = await addDoc(collection(db, 'events'), {
    ...data,
    slots: sortSlots(data.slots),
    isOpen: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEvent(id: string, data: Partial<Pick<ShiftEvent, 'title' | 'dates' | 'slots' | 'isOpen'>>) {
  await updateDoc(eventRef(id), { ...data, ...(data.slots ? { slots: sortSlots(data.slots) } : {}) });
}

export async function deleteEvent(id: string, names: string[]) {
  // Firestore 刪掉父文件不會順便刪子集合，所以先把每個人的資料刪掉
  await Promise.all(names.map((n) => deleteDoc(availabilityRef(id, n))));
  await deleteDoc(eventRef(id));
}

export async function deletePerson(eventId: string, name: string) {
  await deleteDoc(availabilityRef(eventId, name));
}

export async function renamePerson(eventId: string, from: string, to: string, slots: string[]) {
  await saveAvailability(eventId, to, slots);
  await deleteDoc(availabilityRef(eventId, from));
}
