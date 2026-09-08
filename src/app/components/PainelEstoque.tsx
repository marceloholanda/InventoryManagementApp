import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Search, ChevronLeft, ChevronRight, User, Filter } from "lucide-react";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { EditProdutoDialog } from "./EditProdutoDialog";
import type { Produto } from "../types";

export type { Produto } from "../types";

interface PainelEstoqueProps {
  produtos: Produto[];
  onEditProduto?: (id: string, produto: Produto) => Promise<void>;
}

const ITEMS_PER_PAGE = 30;

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function parseLocalDate(dateStr: string): Date {
  // evita off-by-one de timezone para datas no formato YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function PainelEstoque({ produtos, onEditProduto }: PainelEstoqueProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [mesFiltro, setMesFiltro] = useState("todos");
  const [responsavelFiltro, setResponsavelFiltro] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Meses disponíveis nos dados
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach(p => {
      const d = parseLocalDate(p.dataEntrada);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(set).sort().reverse();
  }, [produtos]);

  // Responsáveis únicos
  const responsaveisUnicos = useMemo(() => {
    const set = new Set<string>();
    produtos.forEach(p => { if (p.responsavel) set.add(p.responsavel); });
    return Array.from(set).sort();
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    return produtos.filter(produto => {
      const matchSearch =
        produto.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        produto.notaFiscal.toLowerCase().includes(searchTerm.toLowerCase());

      const matchMes = (() => {
        if (mesFiltro === "todos") return true;
        const d = parseLocalDate(produto.dataEntrada);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === mesFiltro;
      })();

      const matchResp =
        responsavelFiltro === "" ||
        (produto.responsavel ?? "").toLowerCase().includes(responsavelFiltro.toLowerCase());

      return matchSearch && matchMes && matchResp;
    });
  }, [produtos, searchTerm, mesFiltro, responsavelFiltro]);

  const totalPages = Math.ceil(produtosFiltrados.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const produtosPaginados = produtosFiltrados.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleSearch = (value: string) => { setSearchTerm(value); setCurrentPage(1); };
  const handleMes = (value: string) => { setMesFiltro(value); setCurrentPage(1); };
  const handleResp = (value: string) => { setResponsavelFiltro(value); setCurrentPage(1); };

  const totalItens = produtos.reduce((sum, p) => sum + p.quantitativo, 0);
  const baixo = produtos.filter(p => p.quantitativo > 0 && p.quantitativo < (p.limiteEstoqueBaixo || 10)).length;
  const semEstoque = produtos.filter(p => p.quantitativo === 0).length;

  const mesLabel = (key: string) => {
    const [year, month] = key.split("-");
    return `${MESES_PT[parseInt(month) - 1]} / ${year}`;
  };

  const filtersActive = mesFiltro !== "todos" || responsavelFiltro !== "" || searchTerm !== "";

  return (
    <div className="space-y-6">
      {/* ── Cards de resumo ───────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total de Produtos</CardDescription>
            <CardTitle className="text-4xl">{produtos.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total de Itens</CardDescription>
            <CardTitle className="text-4xl">{totalItens}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Estoque Baixo</CardDescription>
            <CardTitle className="text-4xl text-yellow-600">{baixo}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Sem Estoque</CardDescription>
            <CardTitle className="text-4xl text-destructive">{semEstoque}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* ── Tabela principal ──────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle>Estoque em Tempo Real</CardTitle>
                <CardDescription>Visualização completa do inventário atual</CardDescription>
              </div>
              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground self-start sm:self-auto"
                  onClick={() => { setSearchTerm(""); setMesFiltro("todos"); setResponsavelFiltro(""); setCurrentPage(1); }}
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  Limpar filtros
                </Button>
              )}
            </div>

            {/* ── Filtros ─────────────────────────────── */}
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou NF..."
                  value={searchTerm}
                  onChange={e => handleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filtro de mês */}
              <Select value={mesFiltro} onValueChange={handleMes}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os meses</SelectItem>
                  {mesesDisponiveis.map(m => (
                    <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro de responsável */}
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por responsável..."
                  value={responsavelFiltro}
                  onChange={e => handleResp(e.target.value)}
                  className="pl-9"
                  list="responsaveis-list"
                />
                <datalist id="responsaveis-list">
                  {responsaveisUnicos.map(r => <option key={r} value={r} />)}
                </datalist>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-base">
                  <TableHead className="text-base font-semibold">Data de Entrada</TableHead>
                  <TableHead className="text-base font-semibold">Descrição do Produto</TableHead>
                  <TableHead className="text-base font-semibold">Nota Fiscal</TableHead>
                  <TableHead className="text-base font-semibold">Responsável</TableHead>
                  <TableHead className="text-base font-semibold text-right">Quantitativo</TableHead>
                  <TableHead className="text-base font-semibold">Status</TableHead>
                  <TableHead className="text-base font-semibold text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtosPaginados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10 text-base">
                      {filtersActive ? "Nenhum produto encontrado com os filtros aplicados" : "Nenhum produto no estoque"}
                    </TableCell>
                  </TableRow>
                ) : (
                  produtosPaginados.map(produto => (
                    <TableRow key={produto.id}>
                      <TableCell className="whitespace-nowrap text-base">
                        {parseLocalDate(produto.dataEntrada).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-medium text-base">{produto.descricao}</TableCell>
                      <TableCell className="text-base">{produto.notaFiscal}</TableCell>
                      <TableCell>
                        {produto.responsavel ? (
                          <span className="flex items-center gap-1.5 text-base">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            {produto.responsavel}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-base">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-base">{produto.quantitativo}</TableCell>
                      <TableCell>
                        {produto.quantitativo === 0 ? (
                          <Badge variant="destructive">Sem Estoque</Badge>
                        ) : produto.quantitativo < (produto.limiteEstoqueBaixo || 10) ? (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-600">Baixo</Badge>
                        ) : (
                          <Badge variant="default" className="bg-green-600">Normal</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onEditProduto && (
                            <EditProdutoDialog produto={produto} onEdit={onEditProduto} />
                          )}
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
                {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, produtosFiltrados.length)} de {produtosFiltrados.length} produtos
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <span className="text-sm">Página {currentPage} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Próxima <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
