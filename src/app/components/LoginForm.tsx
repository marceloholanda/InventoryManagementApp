import { useState, type FormEvent } from "react";
import { LogIn, Package } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface LoginFormProps {
  configurationMissing?: boolean;
}

export function LoginForm({ configurationMissing = false }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (configurationMissing) return;
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError("E-mail ou senha inválidos.");
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <Package className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
          <CardTitle>Sistema de Inventário</CardTitle>
          <CardDescription>Entre com a conta autorizada para acessar o estoque.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
            </div>
            {configurationMissing && (
              <p role="alert" className="text-sm text-destructive">Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.</p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={loading || configurationMissing}>
              <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

