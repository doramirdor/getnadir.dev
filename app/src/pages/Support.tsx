import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LifeBuoy, Plus, ArrowLeft, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

// ── Types ───────────────────────────────────────────────────────────────

type TicketCategory = "billing" | "technical" | "feature_request" | "other";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high";

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_staff: boolean;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  resolved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  billing: "Billing",
  technical: "Technical",
  feature_request: "Feature Request",
  other: "Other",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Component ───────────────────────────────────────────────────────────

const Support = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // New ticket form state
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState<TicketCategory>("technical");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets((data as Ticket[]) || []);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load tickets";
      logger.error("Support tickets fetch error:", error);
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newDescription.trim()) return;
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        subject: newSubject.trim(),
        description: newDescription.trim(),
        category: newCategory,
        priority: "medium",
      });

      if (error) throw error;

      toast({ title: "Ticket created", description: "We'll get back to you soon." });
      setShowCreateDialog(false);
      setNewSubject("");
      setNewCategory("technical");
      setNewDescription("");
      fetchTickets();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create ticket";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setCreating(false);
    }
  };

  const openTicketDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data as TicketMessage[]) || []);
    } catch (error) {
      logger.error("Ticket messages fetch error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load messages",
      });
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSending(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        user_id: user.id,
        message: replyText.trim(),
        is_staff: false,
      });

      if (error) throw error;

      setReplyText("");
      // Re-fetch messages
      openTicketDetail(selectedTicket);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send message";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setSending(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Ticket detail view ─────────────────────────────────────────────

  if (selectedTicket) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedTicket(null);
              setMessages([]);
              setReplyText("");
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>

        <Card className="clean-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <CardTitle className="text-lg font-semibold">
                  {selectedTicket.subject}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[selectedTicket.status]}`}
                  >
                    {STATUS_LABELS[selectedTicket.status]}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_LABELS[selectedTicket.category]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(selectedTicket.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Original description */}
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {selectedTicket.description}
              </p>
            </div>

            {/* Messages thread */}
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
                  <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
                </div>
              </div>
            ) : messages.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Messages</h3>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-4 ${
                      msg.is_staff
                        ? "bg-primary/5 border border-primary/10"
                        : "bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {msg.is_staff ? "Support Team" : "You"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {msg.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Reply input */}
            {selectedTicket.status !== "closed" && (
              <div className="space-y-3 pt-2 border-t">
                <Textarea
                  placeholder="Type your reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  className="resize-none focus-ring"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sending}
                    size="sm"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {sending ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Ticket list view ───────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h1 className="page-title">Support</h1>
          <p className="page-description">
            View and manage your support tickets
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          size="sm"
          className="focus-ring shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
      </div>

      {/* Ticket list */}
      <Card className="clean-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Your Tickets</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {tickets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                <LifeBuoy className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                No tickets yet
              </h3>
              <p className="text-muted-foreground mb-4">
                Need help? Create a ticket.
              </p>
              <Button
                onClick={() => setShowCreateDialog(true)}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create a Ticket
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => openTicketDetail(ticket)}
                  className="w-full text-left group p-4 rounded-xl transition-all duration-200 bg-card hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground truncate">
                          {ticket.subject}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                        {ticket.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status]}`}
                        >
                          {STATUS_LABELS[ticket.status]}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORY_LABELS[ticket.category]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {PRIORITY_LABELS[ticket.priority]} priority
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(ticket.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Ticket Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Support Ticket</DialogTitle>
            <DialogDescription>
              Describe your issue and we'll get back to you as soon as possible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input
                id="ticket-subject"
                placeholder="Brief summary of the issue"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                maxLength={200}
                className="focus-ring"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket-category">Category</Label>
              <Select
                value={newCategory}
                onValueChange={(v) => setNewCategory(v as TicketCategory)}
              >
                <SelectTrigger className="focus-ring">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket-description">Description</Label>
              <Textarea
                id="ticket-description"
                placeholder="Provide details about your issue..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={5}
                maxLength={5000}
                className="resize-none focus-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTicket}
              disabled={!newSubject.trim() || !newDescription.trim() || creating}
            >
              {creating ? "Creating..." : "Create Ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Support;
