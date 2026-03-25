import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Plus, UserMinus, Shield, Users, Key, Check, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';

interface InviteCode {
  code: string;
  label: string;
  role: string;
  maxUses: number;
  usedCount: number;
  usedBy: { userId: string; name: string; joinedAt: string }[];
  active: boolean;
  createdAt: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function TeamAdmin() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState('');

  const token = localStorage.getItem('crm_token') || '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    Promise.all([
      fetch('/api/invite-codes', { headers }).then(r => r.ok ? r.json() : []),
      fetch('/api/auth/users', { headers }).then(r => r.ok ? r.json() : []),
    ]).then(([codesData, membersData]) => {
      setCodes(codesData);
      setMembers(membersData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const createCode = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/invite-codes', {
        method: 'POST',
        headers,
        body: JSON.stringify({ label: newLabel || 'Team invite', role: 'broker', maxUses: 20 }),
      });
      if (!res.ok) throw new Error('Failed to create code');
      const newCode = await res.json();
      setCodes(prev => [...prev, newCode]);
      setNewLabel('');
    } catch {
      setError('Failed to create invite code');
    }
    setCreating(false);
  };

  const toggleCode = async (code: string, active: boolean) => {
    try {
      await fetch(`/api/invite-codes/${code}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: !active }),
      });
      setCodes(prev => prev.map(c => c.code === code ? { ...c, active: !active } : c));
    } catch {}
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this team member? They will lose access.')) return;
    try {
      const res = await fetch(`/api/auth/users/${userId}`, { method: 'DELETE', headers });
      if (res.ok) setMembers(prev => prev.filter(m => m.id !== userId));
    } catch {}
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-400" size={24} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Shield size={24} className="text-blue-500" />
          Team Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage invite codes and team members</p>
      </div>

      {/* Invite Codes Section */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-800 flex items-center gap-2">
            <Key size={18} className="text-purple-500" />
            Team Invite Codes
          </h2>
        </div>

        {/* Create new code */}
        <div className="flex gap-3 mb-5">
          <Input
            placeholder="Label (e.g. 'Bellevue office')"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="h-10 max-w-xs"
          />
          <Button
            onClick={createCode}
            disabled={creating}
            className="h-10 px-4 text-sm font-medium"
            style={{ background: 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(250, 60%, 50%))' }}
          >
            {creating ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
            Generate Code
          </Button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Codes list */}
        <div className="space-y-3">
          {codes.map(code => (
            <div
              key={code.code}
              className="rounded-xl border p-5 transition-all"
              style={{
                background: code.active ? 'white' : 'hsl(220, 14%, 97%)',
                borderColor: code.active ? 'hsl(220, 14%, 90%)' : 'hsl(220, 14%, 92%)',
                opacity: code.active ? 1 : 0.7,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <code className="text-lg font-mono font-bold tracking-wider" style={{ color: code.active ? 'hsl(220, 70%, 50%)' : 'hsl(220, 10%, 60%)' }}>
                      {code.code}
                    </code>
                    <button
                      onClick={() => copyCode(code.code)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                      title="Copy code"
                    >
                      {copiedCode === code.code ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <span className="text-sm text-gray-500">{code.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {code.usedCount}/{code.maxUses} used
                  </span>
                  <button
                    onClick={() => toggleCode(code.code, code.active)}
                    className="p-1 rounded transition-colors"
                    title={code.active ? 'Deactivate' : 'Activate'}
                  >
                    {code.active ? (
                      <ToggleRight size={24} className="text-green-500" />
                    ) : (
                      <ToggleLeft size={24} className="text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {code.usedBy.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1.5">Joined via this code:</p>
                  <div className="flex flex-wrap gap-2">
                    {code.usedBy.map((u, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-md">
                        {u.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Team Members Section */}
      <div>
        <h2 className="text-lg font-medium text-gray-800 flex items-center gap-2 mb-4">
          <Users size={18} className="text-blue-500" />
          Team Members ({members.length})
        </h2>

        <div className="space-y-2">
          {members.map(member => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ background: member.role === 'admin'
                    ? 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(250, 60%, 50%))'
                    : 'linear-gradient(135deg, hsl(200, 50%, 55%), hsl(180, 40%, 50%))' }}
                >
                  {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{member.name}</p>
                  <p className="text-xs text-gray-400">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  member.role === 'admin'
                    ? 'bg-purple-50 text-purple-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {member.role}
                </span>
                {member.role !== 'admin' && (
                  <button
                    onClick={() => removeMember(member.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                    title="Remove member"
                  >
                    <UserMinus size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
