"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client. Talks only to this app's /api/auth endpoints. */
export const authClient = createAuthClient();
export const { signIn, signUp, signOut } = authClient;
