import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Plus, Minus, User, ChevronLeft, ChevronRight, ChevronDown, X, CalendarIcon, AlignLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Movimentacao, NovaMovimentacao, Produto } from "../types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface PainelMovimentacaoProps {
  onAddMovimentacao: (movimentacao: NovaMovimentacao) => Promise<void>;
  onCorrectMovimentacao: (id: string, novoQuantitativo: number, motivo: string, responsavel: string) => Promise<void>;
  movimentacoes: Movimentacao[];
  produtos: Produto[];
  disabled?: boolean;
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

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ── Botão de filtro reutilizável ───────────────────────────────────────────
interface FilterButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  activeLabel?: string;
  onClear: () => void;
  children: React.ReactNode;
}

function FilterButton({ label, icon, active, activeLabel, onClear, children }: FilterButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          className={`gap-2 ${active ? "pr-2" : ""}`}
          size="sm"
        >
          {icon}
          <span>{active && activeLabel ? activeLabel : label}</span>
          {active ? (
            <span
              role="button"
              className="ml-1 rounded-full hover:bg-white/20 p-0.5"
              onClick={e => { e.stopPropagation(); onClear(); setOpen(false); }}
            >
              <X className="h-3 w-3" />
            </span>
          ) : (
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function PainelMovimentacao({ onAddMovimentacao, onCorrectMovimentacao, movimentacoes, produtos, disabled = false }: PainelMovimentacaoProps) {
  const [formData, setFormData] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);

  // Estado do dialog de edição
  const [editando, setEditando] = useState<Movimentacao | null>(null);
  const [editQtd, setEditQtd] = useState("");
  const [editMotivo, setEditMotivo] = useState("");
  const [editResponsavel, setEditResponsavel] = useState("");
  const [saving, setSaving] = useState(false);

  // Filtros
  const [filtroResponsavel, setFiltroResponsavel] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroDescricao, setFiltroDescricao] = useState("");

  const set = (field: keyof typeof emptyForm, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  // ── Opções únicas para os filtros ────────────────────────────────────────
  const responsaveisUnicos = useMemo(() => {
    const s = new Set<string>();
    movimentacoes.forEach(m => { if (m.responsavel) s.add(m.responsavel); });
    return Array.from(s).sort();
  }, [movimentacoes]);

  const descricoesUnicas = useMemo(() => {
    const s = new Set<string>();
    movimentacoes.forEach(m => s.add(m.descricao));
    return Array.from(s).sort();
  }, [movimentacoes]);

  // ── Histórico filtrado ────────────────────────────────────────────────────
  const historicoFiltrado = useMemo(() => {
    return movimentacoes
      .slice()
      .reverse()
      .filter(m => {
        if (filtroResponsavel && (m.responsavel ?? "") !== filtroResponsavel) return false;
        if (filtroDescricao && m.descricao !== filtroDescricao) return false;
        if (filtroDataInicio) {
          const d = parseLocalDate(m.dataSaida);
          const ini = parseLocalDate(filtroDataInicio);
          if (d < ini) return false;
        }
        if (filtroDataFim) {
          const d = parseLocalDate(m.dataSaida);
          const fim = parseLocalDate(filtroDataFim);
          if (d > fim) return false;
        }
        return true;
      });
  }, [movimentacoes, filtroResponsavel, filtroDescricao, filtroDataInicio, filtroDataFim]);

  const totalPages = Math.ceil(historicoFiltrado.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const historicosPaginados = historicoFiltrado.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const resetPage = () => setCurrentPage(1);

  const abrirEdicao = (mov: Movimentacao) => {
    setEditando(mov);
    setEditQtd(mov.quantitativo.toString());
    setEditMotivo("");
    setEditResponsavel(mov.responsavel ?? "");
  };

  const salvarEdicao = async () => {
    const novoQtd = parseInt(editQtd);
    if (isNaN(novoQtd) || novoQtd <= 0) {
      toast.error("Quantitativo deve ser maior que zero");
      return;
    }
    if (!editMotivo.trim()) { toast.error("Informe o motivo da correção"); return; }
    if (!editResponsavel.trim()) { toast.error("Informe o responsável pela correção"); return; }
    if (!editando) return;
    setSaving(true);
    try {
      await onCorrectMovimentacao(editando.id, novoQtd, editMotivo.trim(), editResponsavel.trim());
      setEditando(null);
    } catch {
      // A tela principal já apresenta a mensagem retornada pelo servidor.
    } finally {
      setSaving(false);
    }
  };

  const filtersActive = filtroResponsavel || filtroDescricao || filtroDataInicio || filtroDataFim;

  // ── Label da data ─────────────────────────────────────────────────────────
  const dataFiltroLabel = useMemo(() => {
    if (filtroDataInicio && filtroDataFim)
      return `${parseLocalDate(filtroDataInicio).toLocaleDateString("pt-BR")} – ${parseLocalDate(filtroDataFim).toLocaleDateString("pt-BR")}`;
    if (filtroDataInicio)
      return `A partir de ${parseLocalDate(filtroDataInicio).toLocaleDateString("pt-BR")}`;
    if (filtroDataFim)
      return `Até ${parseLocalDate(filtroDataFim).toLocaleDateString("pt-BR")}`;
    return "";
  }, [filtroDataInicio, filtroDataFim]);

  // ── Submit do formulário ──────────────────────────────────────────────────
  const handleSubmit = async (tipo: "entrada" | "saida") => {
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
      const prod = produtos.find(p => p.descricao.toLowerCase() === formData.descricao.toLowerCase());
      if (!prod) { toast.error("Produto não encontrado no estoque"); return; }
      if (prod.quantitativo < quantitativo) {
        toast.error(`Estoque insuficiente. Disponível: ${prod.quantitativo}`);
        return;
      }
    }
    setSaving(true);
    try {
      await onAddMovimentacao({
        dataSaida: formData.dataSaida,
        descricao: formData.descricao,
        quantitativo,
        tipo,
        notaFiscal: tipo === "entrada" ? formData.notaFiscal : undefined,
        limiteEstoqueBaixo: tipo === "entrada" ? parseInt(formData.limiteEstoqueBaixo) : undefined,
        responsavel: formData.responsavel,
      });
      setFormData({ ...emptyForm, dataSaida: new Date().toISOString().split("T")[0] });
    } catch {
      // Mantém o formulário preenchido para a operadora corrigir ou tentar novamente.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Formulário ─────────────────────────────────────────────────── */}
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

            {/* ENTRADA */}
            <TabsContent value="entrada" className="space-y-4 mt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dataEntrada">Data de Entrada *</Label>
                  <Input id="dataEntrada" type="date" value={formData.dataSaida} onChange={e => set("dataSaida", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qtdEntrada">Quantitativo *</Label>
                  <Input id="qtdEntrada" type="number" placeholder="0" min="1" value={formData.quantitativo} onChange={e => set("quantitativo", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="descEntrada">Descrição do Produto *</Label>
                <Input id="descEntrada" placeholder="Ex: Notebook Dell Inspiron 15" value={formData.descricao} onChange={e => set("descricao", e.target.value)} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nfEntrada">Número da Nota Fiscal *</Label>
                  <Input id="nfEntrada" placeholder="Ex: NF-12345" value={formData.notaFiscal} onChange={e => set("notaFiscal", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="limiteEntrada">Limite para Estoque Baixo</Label>
                  <Input id="limiteEntrada" type="number" placeholder="10" min="1" value={formData.limiteEstoqueBaixo} onChange={e => set("limiteEstoqueBaixo", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="respEntrada">Responsável *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="respEntrada" className="pl-9" placeholder="Nome de quem está realizando a entrada" value={formData.responsavel} onChange={e => set("responsavel", e.target.value)} />
                </div>
              </div>
              <Button onClick={() => void handleSubmit("entrada")} className="w-full" disabled={disabled || saving}>
                <Plus className="mr-2 h-4 w-4" /> Registrar Entrada
              </Button>
            </TabsContent>

            {/* SAÍDA */}
            <TabsContent value="saida" className="space-y-4 mt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dataSaida">Data de Saída *</Label>
                  <Input id="dataSaida" type="date" value={formData.dataSaida} onChange={e => set("dataSaida", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qtdSaida">Quantitativo *</Label>
                  <Input id="qtdSaida" type="number" placeholder="0" min="1" value={formData.quantitativo} onChange={e => set("quantitativo", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="produtoSaida">Selecionar Produto *</Label>
                <Select onValueChange={v => set("descricao", v)} value={formData.descricao}>
                  <SelectTrigger id="produtoSaida">
                    <SelectValue placeholder="Escolha o produto do estoque" />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.filter(p => p.quantitativo > 0).length === 0 ? (
                      <SelectItem value="__vazio__" disabled>Nenhum produto disponível</SelectItem>
                    ) : (
                      produtos.filter(p => p.quantitativo > 0).map(p => (
                        <SelectItem key={p.id} value={p.descricao}>
                          {p.descricao} — Estoque: {p.quantitativo}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="respSaida">Responsável / Solicitante *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="respSaida" className="pl-9" placeholder="Nome de quem está solicitando o material" value={formData.responsavel} onChange={e => set("responsavel", e.target.value)} />
                </div>
              </div>
              <Button onClick={() => void handleSubmit("saida")} className="w-full" disabled={disabled || saving}>
                <Minus className="mr-2 h-4 w-4" /> Registrar Saída
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Histórico ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Histórico de Movimentações</CardTitle>
                <CardDescription>
                  {historicoFiltrado.length} movimentação{historicoFiltrado.length !== 1 ? "ões" : ""} encontrada{historicoFiltrado.length !== 1 ? "s" : ""}
                  {filtersActive ? " (filtrado)" : ""}
                </CardDescription>
              </div>
              {filtersActive && (
                <Button variant="ghost" size="sm" className="text-muted-foreground"
                  onClick={() => { setFiltroResponsavel(""); setFiltroDescricao(""); setFiltroDataInicio(""); setFiltroDataFim(""); resetPage(); }}>
                  <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
                </Button>
              )}
            </div>

            {/* ── Botões de filtro ──────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">

              {/* Filtro: Responsável */}
              <FilterButton
                label="Responsável"
                icon={<User className="h-3.5 w-3.5" />}
                active={!!filtroResponsavel}
                activeLabel={filtroResponsavel}
                onClear={() => { setFiltroResponsavel(""); resetPage(); }}
              >
                <p className="text-xs font-medium text-muted-foreground mb-2">Filtrar por responsável</p>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {responsaveisUnicos.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Nenhum responsável registrado</p>
                  ) : (
                    responsaveisUnicos.map(r => (
                      <button
                        key={r}
                        onClick={() => { setFiltroResponsavel(r); resetPage(); }}
                        className={`text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors ${filtroResponsavel === r ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                      >
                        {r}
                      </button>
                    ))
                  )}
                </div>
              </FilterButton>

              {/* Filtro: Descrição */}
              <FilterButton
                label="Produto"
                icon={<AlignLeft className="h-3.5 w-3.5" />}
                active={!!filtroDescricao}
                activeLabel={filtroDescricao.length > 20 ? filtroDescricao.slice(0, 20) + "…" : filtroDescricao}
                onClear={() => { setFiltroDescricao(""); resetPage(); }}
              >
                <p className="text-xs font-medium text-muted-foreground mb-2">Filtrar por produto</p>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {descricoesUnicas.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Nenhum produto registrado</p>
                  ) : (
                    descricoesUnicas.map(d => (
                      <button
                        key={d}
                        onClick={() => { setFiltroDescricao(d); resetPage(); }}
                        className={`text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors ${filtroDescricao === d ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                      >
                        {d}
                      </button>
                    ))
                  )}
                </div>
              </FilterButton>

              {/* Filtro: Data */}
              <FilterButton
                label="Período"
                icon={<CalendarIcon className="h-3.5 w-3.5" />}
                active={!!(filtroDataInicio || filtroDataFim)}
                activeLabel={dataFiltroLabel}
                onClear={() => { setFiltroDataInicio(""); setFiltroDataFim(""); resetPage(); }}
              >
                <p className="text-xs font-medium text-muted-foreground mb-3">Filtrar por período</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Data início</Label>
                    <Input type="date" value={filtroDataInicio} onChange={e => { setFiltroDataInicio(e.target.value); resetPage(); }} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data fim</Label>
                    <Input type="date" value={filtroDataFim} onChange={e => { setFiltroDataFim(e.target.value); resetPage(); }} className="h-8 text-sm" />
                  </div>
                </div>
              </FilterButton>

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
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicosPaginados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      {filtersActive ? "Nenhuma movimentação encontrada com os filtros aplicados" : "Nenhuma movimentação registrada"}
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
                        <Badge variant="outline" className={mov.tipo === "entrada"
                          ? "border-green-500 text-green-700 bg-green-50"
                          : mov.tipo === "saida"
                            ? "border-red-400 text-red-700 bg-red-50"
                            : "border-blue-400 text-blue-700 bg-blue-50"}>
                          {mov.tipo === "entrada" ? "↑ Entrada" : mov.tipo === "saida" ? "↓ Saída" : "↺ Estorno"}
                        </Badge>
                        {mov.corrigida && <Badge variant="secondary" className="ml-2">Corrigida</Badge>}
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirEdicao(mov)}
                            disabled={disabled || saving || mov.tipo === "estorno" || mov.corrigida}
                            aria-label={`Corrigir movimentação de ${mov.descricao}`}
                          >
                            <Pencil className="h-4 w-4 text-blue-600" />
                          </Button>
                        </div>
                      </TableCell>
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
                {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, historicoFiltrado.length)} de {historicoFiltrado.length}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <span className="text-sm">Página {currentPage} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* ── Dialog de edição de quantitativo ──────────────────────── */}
      <Dialog open={!!editando} onOpenChange={open => { if (!open) setEditando(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Corrigir lançamento</DialogTitle>
            <DialogDescription>
              O lançamento original será preservado. O sistema criará um estorno e um novo lançamento para <strong>{editando?.descricao}</strong>.
            </DialogDescription>
          </DialogHeader>
          {editando?.tipo === "saida" && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              ⚠️ Você está editando uma <strong>saída</strong>. Tem certeza? O estoque será recalculado pela diferença.
            </div>
          )}
          <div className="py-2 space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted rounded px-3 py-2">
              <span>Quantidade atual</span>
              <span className="font-semibold text-foreground">{editando?.quantitativo}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-qtd">Nova quantidade *</Label>
              <Input
                id="edit-qtd"
                type="number"
                min="1"
                value={editQtd}
                onChange={e => setEditQtd(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-motivo">Motivo da correção *</Label>
              <Input
                id="edit-motivo"
                value={editMotivo}
                onChange={event => setEditMotivo(event.target.value)}
                placeholder="Ex.: quantidade digitada incorretamente"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-responsavel">Responsável pela correção *</Label>
              <Input
                id="edit-responsavel"
                value={editResponsavel}
                onChange={event => setEditResponsavel(event.target.value)}
              />
            </div>
            {editando && editQtd && !isNaN(parseInt(editQtd)) && parseInt(editQtd) !== editando.quantitativo && (
              <p className="text-xs text-muted-foreground">
                Diferença:{" "}
                <span className={parseInt(editQtd) > editando.quantitativo ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                  {parseInt(editQtd) > editando.quantitativo ? "+" : ""}{parseInt(editQtd) - editando.quantitativo} no estoque
                </span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={() => void salvarEdicao()} disabled={saving}>Registrar correção</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
