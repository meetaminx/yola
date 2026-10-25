import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { ViewingKeyPanel } from "@/components/dashboard/viewing-key-panel";
import { ButtonLink } from "@/components/ui/button";
import { loadDashboard } from "@/lib/server/dashboard";
import { db } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";
import { testnetHealth } from "@/lib/server/testnet";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { project } = await loadDashboard();
  if (!project) return <EmptyState title="No project selected" body="Create a project first." action={<ButtonLink href="/dashboard" size="sm">Create a project</ButtonLink>} />;

  const env = getEnv();
  const [viewingKey, testnet] = await Promise.all([
    db().viewingKey.findUnique({
      where: { projectId_network: { projectId: project.id, network: "testnet" } },
      select: { fingerprint: true, createdAt: true, birthdayHeight: true },
    }),
    env.YOLA_TESTNET_ENABLED ? testnetHealth() : Promise.resolve("disabled" as const),
  ]);

  return (
    <>
      <PageHeader title="Settings" description={<>Project <span className="font-mono text-[13px]">{project.id}</span></>} />

      <div className="flex flex-col gap-6">
        <section aria-labelledby="details-title" className="panel p-6">
          <h2 id="details-title" className="type-heading mb-5 text-lg">Project and network</h2>
          <SettingsForm
            canEdit={project.role === "owner"}
            project={{ id: project.id, name: project.name, description: project.description, defaultNetwork: project.defaultNetwork, testnetConfirmations: project.testnetConfirmations }}
          />
        </section>

        <section aria-labelledby="vk-title" className="panel p-6">
          <h2 id="vk-title" className="type-heading mb-1 text-lg">Testnet viewing key</h2>
          <p className="mb-5 max-w-[68ch] text-sm leading-relaxed text-muted">
            Yola derives a fresh receiving address for every testnet request from your wallet&apos;s unified incoming viewing key,
            and uses it to detect payments. It cannot spend funds. Never paste a seed phrase or spending key here.
          </p>
          <ViewingKeyPanel
            projectId={project.id}
            canEdit={project.role === "owner"}
            testnet={testnet}
            current={viewingKey ? { fingerprint: viewingKey.fingerprint, createdAt: viewingKey.createdAt.toISOString(), birthdayHeight: viewingKey.birthdayHeight } : null}
          />
        </section>

        <section aria-labelledby="env-title" className="panel p-6">
          <h2 id="env-title" className="type-heading mb-4 text-lg">Environment</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="text-muted">
                <span className="text-text">Mainnet is disabled.</span> Live keys and real ZEC payments stay off until the mainnet
                verification path has been built and independently reviewed.
              </span>
            </li>
            <li className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="text-muted">
                <span className="text-text">Testnet is {env.YOLA_TESTNET_ENABLED ? "enabled" : "disabled"} on this server.</span>{" "}
                {env.YOLA_TESTNET_ENABLED ? "Test funds (TAZ) have no monetary value." : "Testnet requests return network_unavailable until the operator configures it."}
              </span>
            </li>
            <li className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-soft" aria-hidden />
              <span className="text-muted">
                <span className="text-text">Demo payments are simulated.</span> They never touch a blockchain and can never become verified payments.
              </span>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
            <Link href="/docs/testnet" className="text-brand-soft hover:underline">Testnet guide</Link>
            <Link href="/docs/security" className="text-brand-soft hover:underline">Security model</Link>
            <Link href="/docs/webhooks" className="text-brand-soft hover:underline">Webhooks</Link>
            <Link href="/docs/api" className="text-brand-soft hover:underline">API reference</Link>
          </div>
        </section>
      </div>
    </>
  );
}
