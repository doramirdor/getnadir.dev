import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface PromptUpload {
  id: string;
  file_name: string;
  file_size: number;
  upload_date: string;
  total_prompts: number;
  processed_prompts: number;
  status: 'uploaded' | 'processing' | 'clustered' | 'failed';
  error_message?: string;
}

interface PromptClusteringUploadProps {
  onUploadComplete?: (upload: PromptUpload) => void;
}

export const PromptClusteringUpload = ({ onUploadComplete }: PromptClusteringUploadProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recentUploads, setRecentUploads] = useState<PromptUpload[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please select a CSV file"
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "Please select a file smaller than 10MB"
      });
      return;
    }

    setSelectedFile(file);
  }, [toast]);

  const parseCSV = (csvText: string): string[] => {
    const lines = csvText.split('\n');
    const prompts: string[] = [];
    
    // Skip header row if it exists
    const startIndex = lines[0]?.toLowerCase().includes('prompt') ? 1 : 0;
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (line && line.length > 0) {
        // Simple CSV parsing - assumes prompts don't contain commas or are quoted
        const prompt = line.split(',')[0]?.replace(/"/g, '').trim();
        if (prompt && prompt.length > 0) {
          prompts.push(prompt);
        }
      }
    }
    
    return prompts;
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Read and parse CSV file
      const csvText = await selectedFile.text();
      const prompts = parseCSV(csvText);

      if (prompts.length === 0) {
        throw new Error("No valid prompts found in the CSV file. Please ensure your CSV has prompts in the first column.");
      }

      setUploadProgress(25);

      // Create upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from('prompt_uploads')
        .insert({
          user_id: user.id,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          total_prompts: prompts.length,
          status: 'uploaded'
        })
        .select()
        .single();

      if (uploadError) throw uploadError;

      setUploadProgress(50);

      // Insert prompts in batches
      const batchSize = 100;
      const promptsToInsert = prompts.map((prompt, index) => ({
        user_id: user.id,
        upload_id: uploadRecord.id,
        prompt_text: prompt,
        row_number: index + 1
      }));

      for (let i = 0; i < promptsToInsert.length; i += batchSize) {
        const batch = promptsToInsert.slice(i, i + batchSize);
        const { error: promptError } = await supabase
          .from('prompts')
          .insert(batch);

        if (promptError) throw promptError;

        // Update progress
        const progress = 50 + (i / promptsToInsert.length) * 40;
        setUploadProgress(progress);
      }

      setUploadProgress(100);

      toast({
        title: "Upload Successful",
        description: `Successfully uploaded ${prompts.length} prompts from ${selectedFile.name}`
      });

      // Reset form
      setSelectedFile(null);
      const fileInput = document.getElementById('csv-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Fetch updated uploads
      await fetchRecentUploads();

      // Call callback if provided
      if (onUploadComplete) {
        onUploadComplete(uploadRecord);
      }

    } catch (error: unknown) {
      logger.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to upload CSV file";
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: errorMessage
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const fetchRecentUploads = async () => {
    setLoadingUploads(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('prompt_uploads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentUploads(data || []);

    } catch (error) {
      logger.error('Error fetching uploads:', error);
    } finally {
      setLoadingUploads(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-yellow-600 animate-spin" />;
      case 'clustered':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'clustered':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Prompts for Clustering
          </CardTitle>
          <p className="text-sm text-gray-600">
            Upload a CSV file containing prompts to generate intelligent clusters for better routing and organization.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Selection */}
          <div>
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={uploading}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              CSV should have prompts in the first column. Maximum file size: 10MB
            </p>
          </div>

          {/* Selected File Info */}
          {selectedFile && (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
                  </div>
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="ml-4"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload & Parse
                      </>
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading and processing...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Uploads */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Uploads</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRecentUploads}
              disabled={loadingUploads}
            >
              {loadingUploads ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Refresh'
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentUploads.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Brain className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p>No uploads yet. Upload your first CSV to get started with clustering.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentUploads.map((upload) => (
                <div key={upload.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(upload.status)}
                    <div>
                      <div className="font-medium">{upload.file_name}</div>
                      <div className="text-sm text-gray-600">
                        {upload.total_prompts} prompts • {formatFileSize(upload.file_size)} • {' '}
                        {new Date(upload.upload_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(upload.status)}>
                      {upload.status}
                    </Badge>
                    {upload.status === 'clustered' && (
                      <Button size="sm" variant="outline">
                        View Clusters
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};