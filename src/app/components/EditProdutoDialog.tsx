import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import type { Produto } from "../types";

interface EditProdutoDialogProps {
  produto: Produto;
  onEdit: (id: string, produto: Produto) => Promise<void>;
  disabled?: boolean;
}

export function EditProdutoDialog({ produto, onEdit, disabled }: EditProdutoDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    dataEntrada: produto.dataEntrada,
    descricao: produto.descricao,
    notaFiscal: produto.notaFiscal,
    limiteEstoqueBaixo: (produto.limiteEstoqueBaixo || 10).toString(),
  });

  const handleSave = async () => {
    const limiteEstoqueBaixo = parseInt(formData.limiteEstoqueBaixo);
    
    if (!formData.descricao.trim()) {
      toast.error('Descrição não pode estar vazia');
      return;
    }
    
    if (isNaN(limiteEstoqueBaixo) || limiteEstoqueBaixo < 1) {
      toast.error('Limite de estoque baixo deve ser pelo menos 1');
      return;
    }

    setSaving(true);
    try {
      await onEdit(produto.id, {
        ...produto,
        dataEntrada: formData.dataEntrada,
        descricao: formData.descricao,
        notaFiscal: formData.notaFiscal,
        limiteEstoqueBaixo,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (disabled) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Pencil className="h-4 w-4 text-muted-foreground opacity-50" />
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4 text-blue-600" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Produto</DialogTitle>
          <DialogDescription>
            Atualize os detalhes cadastrais. O saldo só pode ser alterado por movimentações.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-dataEntrada">Data de Entrada</Label>
            <Input
              id="edit-dataEntrada"
              type="date"
              value={formData.dataEntrada}
              onChange={(e) => setFormData({ ...formData, dataEntrada: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-descricao">Descrição</Label>
            <Input
              id="edit-descricao"
              type="text"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-notaFiscal">Nota Fiscal</Label>
            <Input
              id="edit-notaFiscal"
              type="text"
              value={formData.notaFiscal}
              onChange={(e) => setFormData({ ...formData, notaFiscal: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-limiteEstoqueBaixo">Limite de Estoque Baixo</Label>
            <Input
              id="edit-limiteEstoqueBaixo"
              type="number"
              min="1"
              value={formData.limiteEstoqueBaixo}
              onChange={(e) => setFormData({ ...formData, limiteEstoqueBaixo: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
