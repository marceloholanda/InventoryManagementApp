import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Plus, Minus, User, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Produto } from "./PainelEstoque";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export interface Movimentacao {
  id: string;
  dataSaida: string;
  descricao: string;
  quantitativo: number;
  tipo: "entrada" | "saida";
  notaFiscal?: string;
  limiteEstoqueBaixo?: number;
  responsavel?: string;
}

interface PainelMovimentacaoProps {
  onAddMovimentacao: (movimentacao: Omit<Movimentacao, "id">) => void;
  movimentacoes: Movimentacao[];
  produtos: Produto[];
}

const ITEMS_PER_PAGE = 20;

const emptyForm = {
  dataSaida: new Date().toISOString().split("T")[0],
  descricao: "",
  quantitativo: "",
  notaFiscal: "",
  limiteEstoqueBaixo: "10",
  responsavel: "",
};

// Evita off-by-one de timezone para datas YYYY-MM-DD
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function PainelMovimentacao({ onAddMovimentacao, movimentacoes, produtos }: PainelMovimentacaoProps) {
  const [formData, setFormData] = useState(emptyForm);
  const [responsavelFiltro, setResponsavelFiltro] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const set = (field: keyof typeof emptyForm, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (tipo: "entrada" | "saida") => {
    if (!formData.dataSaida) { toast.error("Por favor, preencha a data"); return; }
    if (!formData.descricao.trim()) { toast.error("Por favor, preencha a descrição do produto"); return; }
    if (!formData.quantitativo.trim()) { toast.error("Por favor, preencha o quantitativo"); return; }
    if (!formData.responsavel.trim()) { toast.error("Por favor, informe o responsável"); return; }

    if (tipo === "entrada" && !formData.notaFiscal.trim()) {
      toast.error("Por favor, preencha o número da nota fiscal para entrada");
      return;
    }

    const quantitativo = parseInt(formData.quantitativo);
    if (isNaN(quantitativo) || quantitativo <= 0) {
      toast.error("Quantitativo deve ser um número maior que zero");
      return;
    }

    if (tipo === "saida") {
      const produtoExistente = produtos.find(
        p => p.descricao.toLowerCase() === formData.descricao.toLowerCase()
      );
      if (!produtoExistente) { toast.error("Produto não encontrado no estoque"); return; }
      if (produtoExistente.quantitativo < quantitativo) {
        toast.error(`Estoque insuficiente. Disponível: ${produtoExistente.quantitativo}`);
        return;
      }
    }

    onAddMovimentacao({
      dataSaida: formData.dataSaida,
      descricao: formData.descricao,
      quantitativo,
      tipo,
      notaFiscal: tipo === "entrada" ? formData.notaFiscal : undefined,
      limiteEstoqueBaixo: tipo === "entrada" ? parseInt(formData.limiteEstoqueBaixo) : undefined,
      responsavel: formData.responsavel,
    });

    setFormData({ ...emptyForm, dataSaida: new Date().toISOString().split("T")[0] });
    toast.success(tipo === "entrada" ? "Entrada registrada com sucesso!" : "Saída registrada com sucesso!");
  };

  // Responsáveis únicos para sugestão
  const responsaveisUnicos = useMemo(() => {
    const s = new Set<string>();
    movimentacoes.forEach(m => { if (m.responsavel) s.add(m.responsavel); });
    return Array.from(s).sort();
  }, [movimentacoes]);

  // Histórico filtrado e ordenado
  const historicoFiltrado = useMemo(() => {
    const filtrado = responsavelFiltro
      ? movimentacoes.filter(m =>
          (m.responsavel ?? "").toLowerCase().includes(responsavelFiltro.toLowerCase())
        )
      : movimentacoes;
    return filtrado.slice().reverse();
  }, [movimentacoes, responsavelFiltro]);

  const totalPages = Math.ceil(historicoFiltrado.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const historicosPaginados = historicoFiltrado.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleFiltroResp = (value: string) => {
    setResponsavelFiltro(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Registrar Movimentação</CardTitle>
          <CardDescription>Adicione entradas ou saídas de produtos do estoque</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="entrada" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrada">Entrada de Produto</TabsTrigger>
              <TabsTrigger value="saida">Saída de Produto</TabsTrigger>
            </TabsList>

            {/* ── ENTRADA ─────────────────────────────────── */}
            <TabsContent value="entrada" className="space-y-4 mt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dataEntrada">Data de Entrada *</Label>
                  <Input
                    id="dataEntrada"
                    type="date"
                    value={formData.dataSaida}
                    onChange={e => set("dataSaida", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantitativoEntrada">Quantitativo *</Label>
                  <Input
                    id="quantitativoEntrada"
                    type="number"
                    placeholder="0"
                    min="1"
                    value={formData.quantitativo}
                    onChange={e => set("quantitativo", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricaoEntrada">Descrição do Produto *</Label>
                <Input
                  id="descricaoEntrada"
                  placeholder="Ex: Notebook Dell Inspiron 15"
                  value={formData.descricao}
                  onChange={e => set("descricao", e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notaFiscal">Número da Nota Fiscal *</Label>
                  <Input
                    id="notaFiscal"
                    placeholder="Ex: NF-12345"
                    value={formData.notaFiscal}
                    onChange={e => set("notaFiscal", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="limiteEstoqueBaixo">Limite para Estoque Baixo</Label>
                  <Input
                    id="limiteEstoqueBaixo"
                    type="number"
                    placeholder="10"
                    min="1"
                    value={formData.limiteEstoqueBaixo}
                    onChange={e => set("limiteEstoqueBaixo", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsavelEntrada">Responsável *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="responsavelEntrada"
                    className="pl-9"
                    placeholder="Nome de quem está realizando a entrada"
                    value={formData.responsavel}
                    onChange={e => set("responsavel", e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={() => handleSubmit("entrada")} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Registrar Entrada
              </Button>
            </TabsContent>

            {/* ── SAÍDA ───────────────────────────────────── */}
            <TabsContent value="saida" className="space-y-4 mt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dataSaida">Data de Saída *</Label>
                  <Input
                    id="dataSaida"
                    type="date"
                    value={formData.dataSaida}
                    onChange={e => set("dataSaida", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantitativoSaida">Quantitativo *</Label>
                  <Input
                    id="quantitativoSaida"
                    type="number"
                    placeholder="0"
                    min="1"
                    value={formData.quantitativo}
                    onChange={e => set("quantitativo", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="produtoSaida">Selecionar Produto *</Label>
                <Select
                  onValueChange={value => set("descricao", value)}
                  value={formData.descricao}
                >
                  <SelectTrigger id="produtoSaida">
                    <SelectValue placeholder="Escolha o produto do estoque" />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.filter(p => p.quantitativo > 0).length === 0 ? (
                      <SelectItem value="__vazio__" disabled>
                        Nenhum produto disponível
                      </SelectItem>
                    ) : (
                      produtos
                        .filter(p => p.quantitativo > 0)
                        .map(produto => (
                          <SelectItem key={produto.id} value={produto.descricao}>
                            {produto.descricao} — Estoque: {produto.quantitativo}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsavelSaida">Responsável / Solicitante *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="responsavelSaida"
                    className="pl-9"
                    placeholder="Nome de quem está solicitando o material"
                    value={formData.responsavel}
                    onChange={e => set("responsavel", e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={() => handleSubmit("saida")} className="w-full">
                <Minus className="mr-2 h-4 w-4" />
                Registrar Saída
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── HISTÓRICO ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Histórico de Movimentações</CardTitle>
              <CardDescription>Últimas movimentações registradas</CardDescription>
            </div>
            {/* Filtro de responsável */}
            <div className="relative w-full sm:w-72">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por responsável..."
                value={responsavelFiltro}
                onChange={e => handleFiltroResp(e.target.value)}
                className="pl-9"
                list="hist-responsaveis-list"
              />
              <datalist id="hist-responsaveis-list">
                {responsaveisUnicos.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicosPaginados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {responsavelFiltro
                        ? "Nenhuma movimentação encontrada para este responsável"
                        : "Nenhuma movimentação registrada"}
                    </TableCell>
                  </TableRow>
                ) : (
                  historicosPaginados.map(mov => (
                    <TableRow key={mov.id}>
                      <TableCell className="whitespace-nowrap">
                        {parseLocalDate(mov.dataSaida).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>{mov.descricao}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            mov.tipo === "entrada"
                              ? "border-green-500 text-green-700 bg-green-50"
                              : "border-red-400 text-red-700 bg-red-50"
                          }
                        >
                          {mov.tipo === "entrada" ? "↑ Entrada" : "↓ Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {mov.responsavel ? (
                          <span className="flex items-center gap-1.5 text-sm">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            {mov.responsavel}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{mov.quantitativo}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, historicoFiltrado.length)} de {historicoFiltrado.length} movimentações
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <span className="text-sm">Página {currentPage} de {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
