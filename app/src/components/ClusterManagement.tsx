import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Brain, Edit, Trash2, Plus, Search, Eye, Users, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface PromptCluster {
  id: string;
  cluster_name: string;
  description: string;
  usage_examples: string[];
  classification_criteria: string[];
  prompt_count: number;
  is_active: boolean;
  upload_id: string;
  created_at: string;
  updated_at: string;
}

interface PromptUpload {
  id: string;
  file_name: string;
  total_prompts: number;
  status: string;
}

interface ClusterManagementProps {
  upload?: PromptUpload | null;
}

export const ClusterManagement = ({ upload }: ClusterManagementProps) => {
  const [clusters, setClusters] = useState<PromptCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCluster, setEditingCluster] = useState<PromptCluster | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showExamples, setShowExamples] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (upload) {
      fetchClusters();
    }
  }, [upload]);

  const fetchClusters = async () => {
    if (!upload) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('prompt_clusters')
        .select('*')
        .eq('user_id', user.id)
        .eq('upload_id', upload.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClusters(data || []);

    } catch (error) {
      logger.error('Error fetching clusters:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch clusters"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCluster = (cluster: PromptCluster) => {
    setEditingCluster(cluster);
    setShowEditDialog(true);
  };

  const handleSaveCluster = async () => {
    if (!editingCluster) return;

    try {
      const { error } = await supabase
        .from('prompt_clusters')
        .update({
          cluster_name: editingCluster.cluster_name,
          description: editingCluster.description,
          usage_examples: editingCluster.usage_examples,
          classification_criteria: editingCluster.classification_criteria,
          is_active: editingCluster.is_active
        })
        .eq('id', editingCluster.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Cluster updated successfully"
      });

      setShowEditDialog(false);
      setEditingCluster(null);
      fetchClusters();

    } catch (error) {
      logger.error('Error updating cluster:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update cluster"
      });
    }
  };

  const handleDeleteCluster = async (clusterId: string) => {
    if (!confirm("Are you sure you want to delete this cluster? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('prompt_clusters')
        .delete()
        .eq('id', clusterId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Cluster deleted successfully"
      });

      fetchClusters();

    } catch (error) {
      logger.error('Error deleting cluster:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete cluster"
      });
    }
  };

  const toggleClusterActive = async (cluster: PromptCluster) => {
    try {
      const { error } = await supabase
        .from('prompt_clusters')
        .update({ is_active: !cluster.is_active })
        .eq('id', cluster.id);

      if (error) throw error;

      fetchClusters();

    } catch (error) {
      logger.error('Error toggling cluster:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update cluster status"
      });
    }
  };

  const filteredClusters = clusters.filter(cluster =>
    cluster.cluster_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cluster.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addUsageExample = () => {
    if (!editingCluster) return;
    setEditingCluster({
      ...editingCluster,
      usage_examples: [...editingCluster.usage_examples, ""]
    });
  };

  const removeUsageExample = (index: number) => {
    if (!editingCluster) return;
    setEditingCluster({
      ...editingCluster,
      usage_examples: editingCluster.usage_examples.filter((_, i) => i !== index)
    });
  };

  const updateUsageExample = (index: number, value: string) => {
    if (!editingCluster) return;
    const newExamples = [...editingCluster.usage_examples];
    newExamples[index] = value;
    setEditingCluster({
      ...editingCluster,
      usage_examples: newExamples
    });
  };

  const addClassificationCriteria = () => {
    if (!editingCluster) return;
    setEditingCluster({
      ...editingCluster,
      classification_criteria: [...editingCluster.classification_criteria, ""]
    });
  };

  const removeClassificationCriteria = (index: number) => {
    if (!editingCluster) return;
    setEditingCluster({
      ...editingCluster,
      classification_criteria: editingCluster.classification_criteria.filter((_, i) => i !== index)
    });
  };

  const updateClassificationCriteria = (index: number, value: string) => {
    if (!editingCluster) return;
    const newCriteria = [...editingCluster.classification_criteria];
    newCriteria[index] = value;
    setEditingCluster({
      ...editingCluster,
      classification_criteria: newCriteria
    });
  };

  if (!upload) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-gray-500">
            <Brain className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p>Select an upload to view and manage clusters</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (upload.status !== 'clustered') {
    return (
      <Card>
        <CardContent className="py-12">
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p><strong>{upload.file_name}</strong> has not been clustered yet.</p>
                <p>Status: <Badge variant="outline">{upload.status}</Badge></p>
                {upload.status === 'uploaded' && (
                  <p className="text-sm text-gray-600">
                    Trigger a cluster warmup to generate clusters from your prompts.
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            Cluster Management
          </h2>
          <p className="text-gray-600">
            Managing clusters for <strong>{upload.file_name}</strong> ({clusters.length} clusters)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search clusters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
        </div>
      </div>

      {/* Clusters Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading clusters...</p>
        </div>
      ) : filteredClusters.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-gray-500">
              <Brain className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p>
                {searchTerm ? `No clusters found matching "${searchTerm}"` : "No clusters available"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredClusters.map((cluster) => (
            <Card key={cluster.id} className={`relative ${!cluster.is_active ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-gray-900 mb-1">
                      {cluster.cluster_name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        <Users className="w-3 h-3 mr-1" />
                        {cluster.prompt_count} prompts
                      </Badge>
                      <Badge 
                        variant={cluster.is_active ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {cluster.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditCluster(cluster)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteCluster(cluster.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                  {cluster.description}
                </p>
                
                <div className="space-y-3">
                  {cluster.usage_examples.length > 0 && (
                    <div>
                      <Label className="text-xs font-medium text-gray-700">Usage Examples</Label>
                      <div className="space-y-1 mt-1">
                        {cluster.usage_examples.slice(0, 2).map((example, index) => (
                          <div key={index} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                            {example}
                          </div>
                        ))}
                        {cluster.usage_examples.length > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-auto p-1"
                            onClick={() => setShowExamples(cluster.id)}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View all {cluster.usage_examples.length} examples
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleClusterActive(cluster)}
                      className="text-xs"
                    >
                      {cluster.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Cluster Dialog */}
      {editingCluster && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Cluster: {editingCluster.cluster_name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Cluster Name */}
              <div>
                <Label htmlFor="cluster-name">Cluster Name</Label>
                <Input
                  id="cluster-name"
                  value={editingCluster.cluster_name}
                  onChange={(e) => setEditingCluster({ ...editingCluster, cluster_name: e.target.value })}
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editingCluster.description}
                  onChange={(e) => setEditingCluster({ ...editingCluster, description: e.target.value })}
                  rows={4}
                />
              </div>

              {/* Usage Examples */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Usage Examples</Label>
                  <Button variant="outline" size="sm" onClick={addUsageExample}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Example
                  </Button>
                </div>
                <div className="space-y-2">
                  {editingCluster.usage_examples.map((example, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={example}
                        onChange={(e) => updateUsageExample(index, e.target.value)}
                        placeholder="Enter usage example"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUsageExample(index)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Classification Criteria */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Classification Criteria</Label>
                  <Button variant="outline" size="sm" onClick={addClassificationCriteria}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Criteria
                  </Button>
                </div>
                <div className="space-y-2">
                  {editingCluster.classification_criteria.map((criteria, index) => (
                    <div key={index} className="flex gap-2">
                      <Textarea
                        value={criteria}
                        onChange={(e) => updateClassificationCriteria(index, e.target.value)}
                        placeholder="Enter classification criteria"
                        rows={2}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeClassificationCriteria(index)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-active"
                  checked={editingCluster.is_active}
                  onChange={(e) => setEditingCluster({ ...editingCluster, is_active: e.target.checked })}
                />
                <Label htmlFor="is-active">Active Cluster</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveCluster} className="bg-purple-600 hover:bg-purple-700">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Examples Dialog */}
      {showExamples && (
        <Dialog open={!!showExamples} onOpenChange={() => setShowExamples(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Usage Examples - {clusters.find(c => c.id === showExamples)?.cluster_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {clusters.find(c => c.id === showExamples)?.usage_examples.map((example, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded">
                  {example}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};