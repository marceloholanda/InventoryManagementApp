import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AlertCircle, ClipboardList, LogOut, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LoginForm } from "./components/LoginForm";
import { PainelEstoque } from "./components/PainelEstoque";
import { PainelMovimentacao } from "./components/PainelMovimentacao";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Toaster } from "./components/ui/sonner";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Movimentacao, NovaMovimentacao, Produto } from "./types";
import { api } from "./utils/api";
import { normalizeDescription } from "./utils/inventory";

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  if (message.includes("Estoque insuficiente")) return message;
  if (message.includes("duplicate key") || message.includes("products_owner_description_unique")) {
    return "Já existe um produto com essa descrição.";
  }
  return message;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadError("");
    try {
      const [productsData, movementsData] = await Promise.all([
        api.getProdutos(),
        api.getMovimentacoes(),
      ]);
      setProdutos(productsData);
      setMovimentacoes(movementsData);
    } catch (error) {
      const message = friendlyError(error);
      setLoadError(message);
      toast.error("Não foi possível carregar os dados do servidor.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddMovimentacao = async (movimento: NovaMovimentacao) => {
    const product = produtos.find(
      item => normalizeDescription(item.descricao) === normalizeDescription(movimento.descricao),
    );

    try {
      if (product) {
        await api.registrarMovimentacao(product.id, movimento);
      } else if (movimento.tipo === "entrada") {
        await api.criarProdutoComEntrada(movimento);
      } else {
        throw new Error("Selecione um produto existente para registrar a saída.");
      }
      await loadData();
      toast.success(movimento.tipo === "entrada" ? "Entrada registrada." : "Saída registrada.");
    } catch (error) {
      const message = friendlyError(error);
      toast.error(message);
      throw error;
    }
  };

  const handleCorrectMovimentacao = async (
    id: string,
    newQuantity: number,
    reason: string,
    responsible: string,
  ) => {
    try {
      await api.corrigirMovimentacao(id, newQuantity, reason, responsible);
      await loadData();
      toast.success("Correção registrada com estorno auditável.");
    } catch (error) {
      toast.error(friendlyError(error));
      throw error;
    }
  };

  const handleEditProduto = async (_id: string, product: Produto) => {
    try {
      await api.atualizarProduto(product);
      await loadData();
      toast.success("Produto atualizado.");
    } catch (error) {
      toast.error(friendlyError(error));
      throw error;
    }
  };

  if (authLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (!session) {
    return <LoginForm configurationMissing={!isSupabaseConfigured} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sistema de Inventário</h1>
            <p className="text-muted-foreground">Gestão de estoque e movimentações</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Atualizar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void supabase.auth.signOut()}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loadError && (
          <div role="alert" className="mb-6 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Sem conexão com o inventário</p>
              <p>Os lançamentos estão bloqueados até a conexão ser restabelecida. {loadError}</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="estoque" className="space-y-6">
          <TabsList className="mx-auto grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="estoque">
              <Package className="mr-2 h-4 w-4" aria-hidden="true" /> Estoque
            </TabsTrigger>
            <TabsTrigger value="movimentacao">
              <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" /> Movimentações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <PainelEstoque produtos={produtos} onEditProduto={handleEditProduto} />
          </TabsContent>
          <TabsContent value="movimentacao">
            <PainelMovimentacao
              onAddMovimentacao={handleAddMovimentacao}
              onCorrectMovimentacao={handleCorrectMovimentacao}
              movimentacoes={movimentacoes}
              produtos={produtos}
              disabled={Boolean(loadError) || loading}
            />
          </TabsContent>
        </Tabs>
      </main>
      <Toaster />
    </div>
  );
}
