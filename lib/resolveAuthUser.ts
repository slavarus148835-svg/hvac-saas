import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * После authStateReady приоритет у auth.currentUser — так надёжнее при
 * browserLocalPersistence, чем только аргумент onAuthStateChanged в первом тике.
 */
export async function resolveAuthUser(userFromObserver: User | null): Promise<User | null> {
  await auth.authStateReady();
  return auth.currentUser ?? userFromObserver;
}
