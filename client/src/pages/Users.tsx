import { useAuth } from "@/_core/hooks/useAuth";
import WICSLayout from "@/components/WICSLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { canManageUsers } from "@/lib/userPermissions";
import { Edit, Loader2, Shield, Trash2, UserPlus, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type UserRole = "user" | "admin" | "operator" | "viewer";

type UserForm = {
  name: string;
  email: string;
  role: UserRole;
};

const emptyForm: UserForm = {
  name: "",
  email: "",
  role: "viewer",
};

function permissionForRole(role: UserRole) {
  return role === "admin" || role === "operator" ? "control" : "readonly";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Users() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const isAdmin = canManageUsers(currentUser?.role);
  const utils = trpc.useUtils();
  const usersQuery = trpc.users.list.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
  });

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<UserForm>(emptyForm);
  const [editForm, setEditForm] = useState<UserForm>(emptyForm);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  const createUser = trpc.users.create.useMutation({
    onSuccess: async result => {
      if (!result.success) {
        toast.error("사용자 등록에 실패했습니다.");
        return;
      }
      if (result.user) {
        utils.users.list.setData(undefined, current => {
          const existing = current ?? [];
          return [result.user!, ...existing.filter(user => user.id !== result.user!.id)];
        });
      }
      await utils.users.list.invalidate();
      toast.success("사용자가 등록되었습니다.");
      setAddForm(emptyForm);
      setIsAddDialogOpen(false);
    },
    onError: error => toast.error(error.message || "사용자 등록에 실패했습니다."),
  });

  const updateUser = trpc.users.update.useMutation({
    onSuccess: async result => {
      if (!result.success) {
        toast.error("사용자 정보 수정에 실패했습니다.");
        return;
      }
      if (result.user) {
        utils.users.list.setData(undefined, current =>
          current?.map(user => user.id === result.user!.id ? result.user! : user),
        );
      }
      await utils.users.list.invalidate();
      toast.success("사용자 정보가 수정되었습니다.");
      setEditingUserId(null);
      setIsEditDialogOpen(false);
    },
    onError: error => toast.error(error.message || "사용자 정보 수정에 실패했습니다."),
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: async (result, variables) => {
      if (!result.success) {
        toast.error("사용자 삭제에 실패했습니다.");
        return;
      }
      const deletedUser = usersQuery.data?.find(user => user.id === variables.userId);
      utils.users.list.setData(undefined, current => current?.filter(user => user.id !== variables.userId));
      await utils.users.list.invalidate();
      toast.success(`${deletedUser?.name || "선택한"} 사용자가 삭제되었습니다.`);
    },
    onError: error => toast.error(error.message || "사용자 삭제에 실패했습니다."),
  });

  const users = usersQuery.data ?? [];
  const controlCount = users.filter(user => permissionForRole(user.role) === "control").length;
  const readonlyCount = users.length - controlCount;

  const handleAddUser = () => {
    const name = addForm.name.trim();
    const email = addForm.email.trim();
    if (!name || !email) {
      toast.error("이름과 이메일을 입력해 주세요.");
      return;
    }
    createUser.mutate({ name, email, role: addForm.role });
  };

  const openEditDialog = (user: (typeof users)[number]) => {
    setEditingUserId(user.id);
    setEditForm({
      name: user.name ?? "",
      email: user.email ?? "",
      role: user.role,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = () => {
    if (editingUserId === null) return;
    const name = editForm.name.trim();
    const email = editForm.email.trim();
    if (!name || !email) {
      toast.error("이름과 이메일을 입력해 주세요.");
      return;
    }
    updateUser.mutate({ userId: editingUserId, name, email, role: editForm.role });
  };

  const handleDeleteUser = (user: (typeof users)[number]) => {
    if (!window.confirm(`${user.name || user.email || "선택한 사용자"} 사용자를 삭제하시겠습니까?`)) return;
    deleteUser.mutate({ userId: user.id });
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "admin":
        return <Badge style={{ backgroundColor: "#7c3aed", color: "white" }}>관리자</Badge>;
      case "operator":
        return <Badge style={{ backgroundColor: "#2563eb", color: "white" }}>운영자</Badge>;
      case "viewer":
      case "user":
        return <Badge variant="outline" style={{ borderColor: "#6b7280", color: "#9ca3af" }}>뷰어</Badge>;
    }
  };

  const getPermissionBadge = (role: UserRole) => {
    const permission = permissionForRole(role);
    return permission === "control" ? (
      <Badge variant="outline" style={{ borderColor: "#4ade80", color: "#4ade80" }}>제어</Badge>
    ) : (
      <Badge variant="outline" style={{ borderColor: "#facc15", color: "#facc15" }}>읽기전용</Badge>
    );
  };

  if (authLoading) {
    return (
      <WICSLayout currentPage="users">
        <Card className="bg-card border-border">
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            사용자 권한을 확인하고 있습니다.
          </CardContent>
        </Card>
      </WICSLayout>
    );
  }

  if (!isAdmin) {
    return (
      <WICSLayout currentPage="users">
        <div style={{ display: "grid", minHeight: "calc(100vh - 96px)", placeItems: "center" }}>
          <Card className="bg-card border-border" style={{ width: "min(520px, 100%)" }}>
            <CardContent style={{ padding: "2rem", textAlign: "center" }}>
              <div style={{ width: "44px", height: "44px", display: "grid", placeItems: "center", margin: "0 auto 1rem", border: "1px solid #facc15", color: "#facc15" }}>
                <Shield className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold">사용자 관리 권한이 없습니다</h2>
              <p className="mt-2 text-sm text-muted-foreground" style={{ lineHeight: 1.7 }}>
                이 메뉴는 관리자 계정만 사용할 수 있습니다. 읽기전용 계정에서는 사용자 목록과 권한 정보를 조회하거나 변경할 수 없습니다.
              </p>
              <Badge variant="outline" className="mt-4" style={{ borderColor: "#facc15", color: "#facc15" }}>
                현재 권한: 읽기전용
              </Badge>
            </CardContent>
          </Card>
        </div>
      </WICSLayout>
    );
  }

  return (
    <WICSLayout currentPage="users">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">사용자 관리</h2>
            <p className="text-muted-foreground text-sm mt-1">사용자 등록, 권한 설정 및 관리</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" style={{ gap: "0.5rem" }}>
                <UserPlus className="w-4 h-4" />
                사용자 등록
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>새 사용자 등록</DialogTitle></DialogHeader>
              <UserFormFields form={addForm} onChange={setAddForm} />
              <Button onClick={handleAddUser} disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                등록
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <StatCard icon={<UsersIcon className="w-5 h-5 text-accent" />} label="전체 사용자" value={users.length} />
          <StatCard icon={<Shield className="w-5 h-5" style={{ color: "#4ade80" }} />} label="제어 권한" value={controlCount} />
          <StatCard icon={<Shield className="w-5 h-5" style={{ color: "#facc15" }} />} label="읽기전용" value={readonlyCount} />
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">사용자 목록</CardTitle>
              {usersQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {usersQuery.isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : usersQuery.isError ? (
              <div className="p-8 text-center text-sm text-destructive">사용자 목록을 불러오지 못했습니다: {usersQuery.error.message}</div>
            ) : users.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">등록된 사용자가 없습니다. 우측 상단의 사용자 등록 버튼으로 추가할 수 있습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left font-medium p-3">이름</th>
                      <th className="text-left font-medium p-3">이메일</th>
                      <th className="text-left font-medium p-3">역할</th>
                      <th className="text-left font-medium p-3">권한</th>
                      <th className="text-left font-medium p-3">상태</th>
                      <th className="text-left font-medium p-3">마지막 로그인</th>
                      <th className="text-left font-medium p-3">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="font-medium p-3">{user.name || "이름 없음"}</td>
                        <td className="font-mono text-xs p-3">{user.email || "-"}</td>
                        <td className="p-3">{getRoleBadge(user.role)}</td>
                        <td className="p-3">{getPermissionBadge(user.role)}</td>
                        <td className="p-3"><span style={{ color: "#4ade80" }}>● 활성</span></td>
                        <td className="font-mono text-xs p-3">{formatDate(user.lastSignedIn)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(user)} aria-label={`${user.name || "사용자"} 수정`}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteUser(user)} disabled={deleteUser.isPending} aria-label={`${user.name || "사용자"} 삭제`}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>사용자 정보 수정</DialogTitle></DialogHeader>
            <UserFormFields form={editForm} onChange={setEditForm} />
            <Button onClick={handleUpdateUser} disabled={updateUser.isPending}>
              {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              변경사항 저장
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </WICSLayout>
  );
}

function UserFormFields({ form, onChange }: { form: UserForm; onChange: (next: UserForm) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
      <div>
        <Label htmlFor="user-name">이름</Label>
        <Input id="user-name" value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} placeholder="사용자 이름" style={{ marginTop: "0.5rem" }} />
      </div>
      <div>
        <Label htmlFor="user-email">이메일</Label>
        <Input id="user-email" value={form.email} onChange={event => onChange({ ...form, email: event.target.value })} placeholder="email@example.com" type="email" style={{ marginTop: "0.5rem" }} />
      </div>
      <div>
        <Label>역할</Label>
        <Select value={form.role} onValueChange={(role: UserRole) => onChange({ ...form, role })}>
          <SelectTrigger style={{ marginTop: "0.5rem" }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">관리자</SelectItem>
            <SelectItem value="operator">운영자</SelectItem>
            <SelectItem value="viewer">뷰어</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-2 text-xs text-muted-foreground">
          {permissionForRole(form.role) === "control" ? "제어 권한이 부여됩니다." : "읽기전용 권한이 부여됩니다."}
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="bg-card border-border">
      <CardContent style={{ padding: "1rem" }}>
        <div className="flex items-center" style={{ gap: "0.75rem" }}>
          {icon}
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-bold font-mono">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
