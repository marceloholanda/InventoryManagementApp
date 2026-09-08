export interface Produto {
  id: string;
  dataEntrada: string;
  descricao: string;
  notaFiscal: string;
  quantitativo: number;
  limiteEstoqueBaixo: number;
  responsavel: string;
}

export type TipoMovimentacao = "entrada" | "saida" | "estorno";

export interface Movimentacao {
  id: string;
  productId: string;
  dataSaida: string;
  descricao: string;
  quantitativo: number;
  tipo: TipoMovimentacao;
  notaFiscal?: string;
  limiteEstoqueBaixo?: number;
  responsavel?: string;
  motivo?: string;
  corrigida?: boolean;
  movimentoRelacionadoId?: string;
}

export interface NovaMovimentacao {
  dataSaida: string;
  descricao: string;
  quantitativo: number;
  tipo: "entrada" | "saida";
  notaFiscal?: string;
  limiteEstoqueBaixo?: number;
  responsavel: string;
}

