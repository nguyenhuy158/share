import React, { useEffect, useState } from "react";
import {
  UploadCloud,
  Key,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Download,
  Terminal,
  FileCode,
  ShieldCheck,
  Globe,
  Sparkles,
  LogOut,
  LogIn,
  Eye,
  Search,
  AlertCircle,
  FileText,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  hasMasterPassword: boolean;
}

interface Artifact {
  id: string;
  title: string;
  filename: string;
  content_type: string;
  size: number;
  views: number;
  version?: number;
  slug?: string | null;
  created_at: string;
  updated_at?: string;
}

interface VersionHistoryItem {
  version: number;
  size: number;
  createdAt: string;
  isCurrent: boolean;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Master password state
  const [masterPassword, setMasterPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Quick manual upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccessUrl, setUploadSuccessUrl] = useState("");

  // Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Tab state for Agent integration: "mcp" | "skill" | "curl"
  const [agentTab, setAgentTab] = useState<"mcp" | "skill" | "curl">("mcp");

  // Version history modal state
  const [selectedArtifactForVersions, setSelectedArtifactForVersions] = useState<Artifact | null>(null);
  const [versionHistory, setVersionHistory] = useState<VersionHistoryItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const handleViewVersions = async (art: Artifact) => {
    setSelectedArtifactForVersions(art);
    setLoadingVersions(true);
    setVersionHistory([]);
    try {
      const res = await fetch(`/api/artifacts/${art.id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersionHistory(data.versions || []);
      }
    } catch (err) {
      console.error("Failed to fetch versions", err);
    } finally {
      setLoadingVersions(false);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        fetchArtifacts();
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };
  const fetchArtifacts = async () => {
    try {
      const res = await fetch("/api/artifacts");
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
      }
    } catch (err) {
      console.error("Failed to load artifacts", err);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSetMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (masterPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetch("/api/user/master-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: masterPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPasswordSuccess(true);
        if (user) {
          setUser({ ...user, hasMasterPassword: true });
        }
      } else {
        setPasswordError(data.error || "Failed to set master password");
      }
    } catch {
      setPasswordError("Network error setting master password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteArtifact = async (id: string) => {
    if (!confirm("Are you sure you want to delete this artifact?")) return;

    try {
      const res = await fetch(`/api/artifacts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setArtifacts(artifacts.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete artifact", err);
    }
  };

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    if (!masterPassword) {
      setUploadError("Please type your Master Password above to authenticate the upload.");
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setUploadSuccessUrl("");

    try {
      const formData = new FormData();
      formData.append("email", user?.email || "");
      formData.append("password", masterPassword);
      formData.append("file", uploadFile);
      formData.append("title", uploadFile.name);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUploadSuccessUrl(data.url);
        setUploadFile(null);
        fetchArtifacts();
      } else {
        setUploadError(data.error || "Upload failed");
      }
    } catch {
      setUploadError("Network error during upload");
    } finally {
      setIsUploading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredArtifacts = artifacts.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const appOrigin = typeof window !== "undefined" ? window.location.origin : "https://share.huyab.click";
  const userEmail = user?.email || "your-email@example.com";
  const userPwdPlaceholder = masterPassword || "YOUR_MASTER_PASSWORD";

  const mcpConfigExample = `{
  "mcpServers": {
    "share": {
      "command": "node",
      "args": ["<path-to-share-repo>/mcp/index.mjs"],
      "env": {
        "SHARE_EMAIL": "${userEmail}",
        "SHARE_PASSWORD": "${userPwdPlaceholder}"
      }
    }
  }
}`;

  const skillInstallCmd = `curl -sSL https://raw.githubusercontent.com/nguyenhuy158/share/main/scripts/install-skill.sh | bash`;

  const curlExample = `curl -X POST "${appOrigin}/api/upload" \\
  -F "email=${userEmail}" \\
  -F "password=${userPwdPlaceholder}" \\
  -F "file=@./index.html" \\
  -F "title=My Demo"`;

  const agentPromptSnippet = `When you create an HTML preview, mockup, or artifact:
Upload it to Share via curl:
curl -s -X POST "${appOrigin}/api/upload" \\
  -F "email=${userEmail}" \\
  -F "password=${userPwdPlaceholder}" \\
  -F "file=@<path-to-file>" \\
  -F "title=<title>"
Then reply with the generated public link: ${appOrigin}/artifact/<uuid>`;

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col font-sans">
      {/* Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 ring-1 ring-sky-400/30">
              <UploadCloud className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Share
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                Artifacts
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-24 bg-surface-muted animate-pulse rounded-lg" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-xs">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name || ""} className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-sky-600 flex items-center justify-center text-[10px] font-bold">
                      {user.email[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-slate-300 font-medium max-w-[140px] truncate">
                    {user.email}
                  </span>
                </div>
                <a
                  href="/logout"
                  className="p-2 rounded-lg text-fg-muted hover:text-rose-400 hover:bg-slate-800/80 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <a
                href="/login"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-medium text-sm transition-all shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign in with SSO</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {!user ? (
          /* Unauthenticated Landing / Hero */
          <div className="py-12 md:py-20 text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Built for AI Agents, Claude Code & MCP Skills
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-6 leading-tight">
              Instant Preview & Artifact Hosting <br />
              <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                Without Setup or Git Friction
              </span>
            </h1>
            <p className="text-fg-muted text-lg mb-8 leading-relaxed">
              Have your AI agent push HTML prototypes, mockups, or SVGs straight from local terminal sessions. Get a live, shareable link in under 2 seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <a
                href="/login"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-base shadow-xl shadow-sky-500/25 transition-all flex items-center justify-center gap-2"
              >
                <LogIn className="w-5 h-5" />
                Sign in with Google SSO
              </a>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 text-left border-t border-slate-800/80 pt-12">
              <div className="p-5 rounded-2xl bg-slate-900/40 border border-border">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mb-3">
                  <Terminal className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white mb-1">1-Command Agent Push</h3>
                <p className="text-sm text-fg-muted">
                  AI agents push files via cURL or custom skills with your email and master password.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-900/40 border border-border">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white mb-1">Direct Live Previews</h3>
                <p className="text-sm text-fg-muted">
                  Clean URLs served at <code className="text-indigo-300">/artifact/:id</code> with exact mime types and scripts enabled.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-900/40 border border-border">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white mb-1">Private by Default</h3>
                <p className="text-sm text-fg-muted">
                  Auto-tagged with <code className="text-emerald-300">noindex</code> headers to keep prototypes out of search engines.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Authenticated Dashboard */
          <div className="space-y-8">
            {/* Top Grid: Master Password & Setup Instructions */}
            <div className="grid lg:grid-cols-12 gap-6">
              {/* Master Password Card */}
              <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="w-5 h-5 text-sky-400" />
                    <h2 className="font-bold text-lg text-white">Master Password</h2>
                  </div>
                  <p className="text-sm text-fg-muted mb-5 leading-relaxed">
                    Set a master password for your account. Your local AI session / CLI uses this password along with your email to upload artifacts.
                  </p>

                  <form onSubmit={handleSetMasterPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        {user.hasMasterPassword ? "Update Master Password" : "Set New Master Password"}
                      </label>
                      <input
                        type="password"
                        placeholder="At least 6 characters"
                        value={masterPassword}
                        onChange={(e) => setMasterPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
                      />
                    </div>

                    {passwordError && (
                      <div className="text-xs text-rose-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {passwordError}
                      </div>
                    )}
                    {passwordSuccess && (
                      <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        Master password saved successfully!
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSavingPassword || !masterPassword}
                      className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-md shadow-sky-500/20"
                    >
                      {isSavingPassword ? "Saving..." : user.hasMasterPassword ? "Update Password" : "Save Master Password"}
                    </button>
                  </form>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-fg-muted flex items-center justify-between">
                  <span>Status:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-full ${
                      user.hasMasterPassword
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {user.hasMasterPassword ? "Active & Configured" : "Not Set Yet"}
                  </span>
                </div>
              </div>

              {/* Quick Upload & Cheatsheet */}
              <div className="lg:col-span-7 space-y-6">
                {/* Manual Upload Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <UploadCloud className="w-5 h-5 text-indigo-400" />
                    <h2 className="font-bold text-lg text-white">Manual Quick Upload</h2>
                  </div>
                  <p className="text-sm text-fg-muted mb-4">
                    Or drop a file directly here to test your preview link.
                  </p>

                  <form onSubmit={handleManualUpload} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="text-sm text-fg-muted file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-surface-muted file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                      />
                      <button
                        type="submit"
                        disabled={isUploading || !uploadFile}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap"
                      >
                        {isUploading ? "Uploading..." : "Upload File"}
                      </button>
                    </div>

                    {uploadError && (
                      <div className="text-xs text-rose-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {uploadError}
                      </div>
                    )}
                    {uploadSuccessUrl && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
                        <span className="truncate mr-2">Published: {uploadSuccessUrl}</span>
                        <a
                          href={uploadSuccessUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold underline flex items-center gap-1 shrink-0"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </form>
                </div>

                {/* Agent & MCP Integration Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-purple-400" />
                      <h2 className="font-bold text-base text-white">AI Agent & MCP Integration</h2>
                    </div>
                    <div className="flex items-center p-1 rounded-xl bg-bg border border-border text-xs">
                      <button
                        type="button"
                        onClick={() => setAgentTab("mcp")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          agentTab === "mcp"
                            ? "bg-sky-500 text-white shadow-sm"
                            : "text-fg-muted hover:text-slate-200"
                        }`}
                      >
                        MCP Server
                      </button>
                      <button
                        type="button"
                        onClick={() => setAgentTab("skill")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          agentTab === "skill"
                            ? "bg-sky-500 text-white shadow-sm"
                            : "text-fg-muted hover:text-slate-200"
                        }`}
                      >
                        Agent Skill
                      </button>
                      <button
                        type="button"
                        onClick={() => setAgentTab("curl")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          agentTab === "curl"
                            ? "bg-sky-500 text-white shadow-sm"
                            : "text-fg-muted hover:text-slate-200"
                        }`}
                      >
                        cURL / Bash
                      </button>
                    </div>
                  </div>

                  {agentTab === "mcp" && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-fg-muted">
                          Add to <code className="text-sky-300">.cursor/mcp.json</code> or Claude Desktop config:
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopy(mcpConfigExample, "mcp")}
                          className="flex items-center gap-1 text-xs text-fg-muted hover:text-sky-300 transition-colors py-1 px-2 rounded-lg bg-surface-muted"
                        >
                          {copiedKey === "mcp" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedKey === "mcp" ? "Copied" : "Copy Config"}
                        </button>
                      </div>
                      <pre className="p-3.5 rounded-xl bg-bg border border-border text-xs font-mono text-slate-300 overflow-x-auto">
                        {mcpConfigExample}
                      </pre>
                      <p className="mt-2.5 text-[11px] text-slate-500">
                        Exposes tools: <code className="text-fg-muted">share_artifact</code> (upload file/content) and{" "}
                        <code className="text-fg-muted">list_artifacts</code>.
                      </p>
                    </div>
                  )}

                  {agentTab === "skill" && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-fg-muted">Install skill to Claude Code & OMP:</p>
                        <button
                          type="button"
                          onClick={() => handleCopy(skillInstallCmd, "skill-cmd")}
                          className="flex items-center gap-1 text-xs text-fg-muted hover:text-sky-300 transition-colors py-1 px-2 rounded-lg bg-surface-muted"
                        >
                          {copiedKey === "skill-cmd" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedKey === "skill-cmd" ? "Copied" : "Copy Command"}
                        </button>
                      </div>
                      <pre className="p-3.5 rounded-xl bg-bg border border-border text-xs font-mono text-slate-300 overflow-x-auto mb-3">
                        {skillInstallCmd}
                      </pre>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-fg-muted">System prompt / Custom instructions:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(agentPromptSnippet, "prompt")}
                          className="text-xs text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1"
                        >
                          {copiedKey === "prompt" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          Copy Prompt
                        </button>
                      </div>
                    </div>
                  )}

                  {agentTab === "curl" && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-fg-muted">Direct cURL upload command:</p>
                        <button
                          type="button"
                          onClick={() => handleCopy(curlExample, "curl")}
                          className="flex items-center gap-1 text-xs text-fg-muted hover:text-sky-300 transition-colors py-1 px-2 rounded-lg bg-surface-muted"
                        >
                          {copiedKey === "curl" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedKey === "curl" ? "Copied" : "Copy cURL"}
                        </button>
                      </div>
                      <pre className="p-3.5 rounded-xl bg-bg border border-border text-xs font-mono text-slate-300 overflow-x-auto">
                        {curlExample}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Artifacts List Section */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-bold text-xl text-white">My Shared Artifacts</h2>
                  <p className="text-sm text-fg-muted">
                    {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"} published
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search artifacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-bg border border-border text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {filteredArtifacts.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-border rounded-2xl">
                  <FileCode className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-fg-muted font-medium">No artifacts found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload your first file or ask your AI agent to push via the API.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-fg-muted text-xs font-semibold uppercase tracking-wider">
                        <th className="pb-3 px-2">Title & Filename</th>
                        <th className="pb-3 px-2">Type</th>
                        <th className="pb-3 px-2">Size</th>
                        <th className="pb-3 px-2">Views</th>
                        <th className="pb-3 px-2">Created</th>
                        <th className="pb-3 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredArtifacts.map((art) => {
                        const publicUrl = `${appOrigin}/artifact/${art.id}`;
                        const isCopied = copiedKey === art.id;

                        return (
                          <tr key={art.id} className="hover:bg-slate-800/30 transition-colors group">
                            <td className="py-3.5 px-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-200 group-hover:text-sky-300 transition-colors">
                                  {art.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleViewVersions(art)}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold hover:bg-sky-500/20 hover:border-sky-500/40 transition-colors cursor-pointer"
                                  title="View version history"
                                >
                                  v{art.version || 1}
                                </button>
                              </div>
                              <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                                <FileText className="w-3 h-3" />
                                <span>{art.filename}</span>
                                {art.slug && (
                                  <span className="text-fg-muted font-sans text-[11px] bg-surface-muted px-1.5 py-0.2 rounded">
                                    slug: {art.slug}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-2">
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-muted text-slate-300 border border-slate-700/60">
                                {art.content_type.split(";")[0]}
                              </span>
                            </td>
                            <td className="py-3.5 px-2 text-fg-muted text-xs font-mono">
                              {formatBytes(art.size)}
                            </td>
                            <td className="py-3.5 px-2 text-fg-muted text-xs">
                              <span className="flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                {art.views}
                              </span>
                            </td>
                            <td className="py-3.5 px-2 text-fg-muted text-xs whitespace-nowrap">
                              <div>{formatDate(art.updated_at || art.created_at)}</div>
                              {art.updated_at && art.updated_at !== art.created_at && (
                                <div className="text-[10px] text-slate-500">Updated</div>
                              )}
                            </td>
                            <td className="py-3.5 px-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleCopy(publicUrl, art.id)}
                                  className="p-1.5 rounded-lg text-fg-muted hover:text-sky-300 hover:bg-surface-muted transition-colors"
                                  title="Copy Preview Link"
                                >
                                  {isCopied ? (
                                    <Check className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                                <a
                                  href={publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg text-fg-muted hover:text-indigo-300 hover:bg-surface-muted transition-colors"
                                  title="Open Preview"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                                <a
                                  href={`/artifact/${art.id}/raw`}
                                  className="p-1.5 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-surface-muted transition-colors"
                                  title="Download Raw File"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                                <button
                                  onClick={() => handleDeleteArtifact(art.id)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-surface-muted transition-colors"
                                  title="Delete Artifact"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      {/* Version History Modal */}
      {selectedArtifactForVersions && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-white">Version History</h3>
                <p className="text-xs text-fg-muted truncate max-w-[280px]">
                  {selectedArtifactForVersions.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArtifactForVersions(null)}
                className="p-1 rounded-lg text-fg-muted hover:text-white hover:bg-surface-muted text-xs font-semibold px-2 py-1"
              >
                Close
              </button>
            </div>

            {loadingVersions ? (
              <div className="py-8 text-center text-xs text-fg-muted">Loading version history...</div>
            ) : versionHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No previous versions saved.</div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {versionHistory.map((item) => {
                  const versionUrl = item.isCurrent
                    ? `${appOrigin}/artifact/${selectedArtifactForVersions.id}`
                    : `${appOrigin}/artifact/${selectedArtifactForVersions.id}?v=${item.version}`;

                  return (
                    <div
                      key={item.version}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">Version {item.version}</span>
                          {item.isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          {formatBytes(item.size)} &bull; {formatDate(item.createdAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(versionUrl, `ver-${item.version}`)}
                          className="p-1.5 rounded-lg text-fg-muted hover:text-sky-300 hover:bg-surface-muted transition-colors"
                          title="Copy version link"
                        >
                          {copiedKey === `ver-${item.version}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={versionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-fg-muted hover:text-indigo-300 hover:bg-surface-muted transition-colors flex items-center gap-1"
                          title="Preview this version"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>
          Share &bull; Zero-friction artifact hosting &bull;{" "}
          <a href="https://github.com/nguyenhuy158/share" target="_blank" rel="noreferrer" className="hover:text-fg-muted underline">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
