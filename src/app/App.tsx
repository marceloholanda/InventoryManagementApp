import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { PainelEstoque, Produto } from "./components/PainelEstoque";
import { PainelMovimentacao, Movimentacao } from "./components/PainelMovimentacao";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { Package, ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "./components/ui/button";
import { api } from "./utils/api";

export default function App() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverConnected, setServerConnected] = useState(false);

  // Carregar dados do Supabase ao iniciar
  useEffect(() => {
    loadData();
  }, []);

  // Salvar backup no localStorage
  useEffect(() => {
    if (produtos.length > 0) {
      localStorage.setItem('produtos_backup', JSON.stringify(produtos));
    }
  }, [produtos]);

  useEffect(() => {
    if (movimentacoes.length > 0) {
      localStorage.setItem('movimentacoes_backup', JSON.stringify(movimentacoes));
    }
  }, [movimentacoes]);

  const loadLocalData = () => {
    const storedProdutos = localStorage.getItem('produtos_backup');
    const storedMovimentacoes = localStorage.getItem('movimentacoes_backup');
    if (storedProdutos) setProdutos(JSON.parse(storedProdutos));
    if (storedMovimentacoes) setMovimentacoes(JSON.parse(storedMovimentacoes));
  };

  const loadData = async () => {
    setLoading(true);

    // Verificação rápida de saúde do servidor (sem retry)
    const online = await api.checkHealth();

    if (!online) {
      setServerConnected(false);
      loadLocalData();
      setLoading(false);
      toast.warning('Servidor indisponível. Usando dados salvos localmente.');
      return;
    }

    try {
      const [produtosData, movimentacoesData] = await Promise.all([
        api.getProdutos(),
        api.getMovimentacoes(),
      ]);

      setProdutos(produtosData);
      setMovimentacoes(movimentacoesData);
      setServerConnected(true);

      if (produtosData.length > 0 || movimentacoesData.length > 0) {
        toast.success('Dados sincronizados com o servidor!');
      }
    } catch (error) {
      console.warn('Falha ao carregar dados do servidor:', error);
      setServerConnected(false);
      loadLocalData();
      toast.warning('Erro ao sincronizar. Usando dados locais.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMovimentacao = async (movimentacao: Omit<Movimentacao, 'id'>) => {
    try {
      const novaMovimentacao: Movimentacao = {
        ...movimentacao,
        id: Date.now().toString(),
      };

      // Salvar movimentação no Supabase
      if (serverConnected) {
        await api.saveMovimentacao(novaMovimentacao);
      }
      setMovimentacoes([...movimentacoes, novaMovimentacao]);

      // Atualizar estoque
      const produtoExistente = produtos.find(
        p => p.descricao.toLowerCase() === movimentacao.descricao.toLowerCase()
      );

      if (produtoExistente) {
        const isEntrada = movimentacao.tipo === 'entrada';
        const produtoAtualizado = {
          ...produtoExistente,
          quantitativo: isEntrada
            ? produtoExistente.quantitativo + movimentacao.quantitativo
            : Math.max(0, produtoExistente.quantitativo - movimentacao.quantitativo),
          dataEntrada: isEntrada ? movimentacao.dataSaida : produtoExistente.dataEntrada,
          notaFiscal: isEntrada && movimentacao.notaFiscal
            ? movimentacao.notaFiscal
            : produtoExistente.notaFiscal,
          limiteEstoqueBaixo: isEntrada && movimentacao.limiteEstoqueBaixo
            ? movimentacao.limiteEstoqueBaixo
            : produtoExistente.limiteEstoqueBaixo,
          responsavel: isEntrada && movimentacao.responsavel
            ? movimentacao.responsavel
            : produtoExistente.responsavel,
        };

        if (serverConnected) {
          await api.saveProduto(produtoAtualizado);
        }
        
        setProdutos(produtos.map(p => 
          p.id === produtoExistente.id ? produtoAtualizado : p
        ));
      } else if (movimentacao.tipo === 'entrada') {
        // Criar novo produto apenas se for entrada
        const novoProduto: Produto = {
          id: Date.now().toString(),
          dataEntrada: movimentacao.dataSaida,
          descricao: movimentacao.descricao,
          notaFiscal: movimentacao.notaFiscal || 'Sem NF',
          quantitativo: movimentacao.quantitativo,
          limiteEstoqueBaixo: movimentacao.limiteEstoqueBaixo || 10,
          responsavel: movimentacao.responsavel,
        };

        if (serverConnected) {
          await api.saveProduto(novoProduto);
        }
        setProdutos([...produtos, novoProduto]);
      }
      
      if (!serverConnected) {
        toast.warning('Dados salvos localmente. Conecte ao servidor para sincronizar.');
      }
    } catch (error) {
      console.warn('Erro ao adicionar movimentação:', error);
      toast.error('Erro ao salvar dados no servidor. Dados salvos localmente.');
    }
  };

  const handleDeleteProduto = async (id: string) => {
    try {
      const produtoParaDeletar = produtos.find(p => p.id === id);
      
      if (serverConnected && produtoParaDeletar) {
        await api.deleteProduto(id);
      }
      
      setProdutos(produtos.filter(p => p.id !== id));
      toast.success('Produto excluído com sucesso!');
    } catch (error) {
      console.warn('Erro ao excluir produto:', error);
      toast.error('Erro ao excluir produto do servidor. Removido localmente.');
      setProdutos(produtos.filter(p => p.id !== id));
    }
  };

  const handleEditProduto = async (id: string, produtoEditado: Produto) => {
    try {
      if (serverConnected) {
        await api.saveProduto(produtoEditado);
      }
      
      setProdutos(produtos.map(p => p.id === id ? produtoEditado : p));
    } catch (error) {
      console.warn('Erro ao editar produto:', error);
      toast.error('Erro ao salvar edição no servidor. Salvo localmente.');
      setProdutos(produtos.map(p => p.id === id ? produtoEditado : p));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Sistema de Inventário</h1>
              <p className="text-muted-foreground">
                Gestão de Estoque e Movimentações
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${serverConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground">
                  {serverConnected ? 'Online' : 'Offline'}
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadData}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Sincronizar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="estoque" className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="estoque">
              <Package className="h-4 w-4 mr-2" />
              Estoque
            </TabsTrigger>
            <TabsTrigger value="movimentacao">
              <ClipboardList className="h-4 w-4 mr-2" />
              Movimentações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <PainelEstoque 
              produtos={produtos} 
              onDeleteProduto={handleDeleteProduto}
              onEditProduto={handleEditProduto}
            />
          </TabsContent>

          <TabsContent value="movimentacao">
            <PainelMovimentacao 
              onAddMovimentacao={handleAddMovimentacao}
              movimentacoes={movimentacoes}
              produtos={produtos}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Toaster />
    </div>
  );
}