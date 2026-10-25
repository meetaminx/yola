"use client";

import { useState } from "react";
import { Playground } from "@/components/playground/playground";
import { createServerGateway } from "@/lib/api/server-gateway";

export function DashboardPlayground({ projectId }: { projectId: string }) {
  const [gateway] = useState(() => createServerGateway(projectId));
  return <Playground gateway={gateway} />;
}
