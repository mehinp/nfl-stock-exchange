import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/number-format";
import { useTrade } from "@/hooks/usePortfolio";
import { useToast } from "@/hooks/use-toast";

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  price: number;
}

interface QuickTradeWidgetProps {
  teams: Team[];
}

export default function QuickTradeWidget({ teams }: QuickTradeWidgetProps) {
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const tradeMutation = useTrade();
  const { toast } = useToast();

  const selectedTeamData = teams.find(t => t.id === selectedTeam);
  const totalCost = selectedTeamData ? selectedTeamData.price * quantity : 0;

  const handleTrade = () => {
    if (!selectedTeamData) return;
    const teamName = selectedTeamData.name;
    const teamAbbrev = selectedTeamData.abbreviation;
    const currentQuantity = quantity;
    tradeMutation.mutate(
      {
        action: tradeType,
        teamName,
        quantity: currentQuantity,
      },
      {
        onSuccess: (data) => {
          setQuantity(1);
          toast({
            title: "Trade executed",
            description: `${tradeType === "buy" ? "Bought" : "Sold"} ${currentQuantity} ${currentQuantity === 1 ? "share" : "shares"} of ${teamName} @ $${Number(data.price).toFixed(2)}`,
          });
        },
        onError: (error) => {
          toast({
            title: "Trade failed",
            description: error instanceof Error ? error.message : "Unable to complete trade.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card className="p-6" data-testid="quick-trade-widget">
      <h2 className="text-lg font-semibold mb-4">Quick Trade</h2>

      <div className="space-y-4">
        <div>
          <Label htmlFor="team-select">Select Team</Label>
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger id="team-select" data-testid="select-team">
              <SelectValue placeholder="Choose a team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name} ({formatCurrency(team.price)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              data-testid="button-decrease-quantity"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="text-center font-mono"
              data-testid="input-quantity"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity(quantity + 1)}
              data-testid="button-increase-quantity"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant={tradeType === 'buy' ? 'default' : 'outline'}
            className="flex-1"
              onClick={() => setTradeType("buy")}
            data-testid="button-trade-type-buy"
          >
            Buy
          </Button>
          <Button
            variant={tradeType === 'sell' ? 'default' : 'outline'}
            className="flex-1"
              onClick={() => setTradeType("sell")}
            data-testid="button-trade-type-sell"
          >
            Sell
          </Button>
        </div>

        {selectedTeamData && (
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Price per share:</span>
              <span className="font-mono">{formatCurrency(selectedTeamData.price)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Quantity:</span>
              <span className="font-mono">
                {formatNumber(quantity, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex justify-between font-semibold pt-2 border-t border-border">
              <span>Total:</span>
              <span className="font-mono">{formatCurrency(totalCost)}</span>
            </div>
          </div>
        )}

        <Button
          className="w-full h-12"
          onClick={handleTrade}
          disabled={!selectedTeam || tradeMutation.isPending}
          data-testid="button-execute-trade"
        >
          {tradeMutation.isPending
            ? "Submitting..."
            : `${tradeType === "buy" ? "Buy" : "Sell"} ${selectedTeamData?.abbreviation || "Team"}`}
        </Button>
      </div>
    </Card>
  );
}
