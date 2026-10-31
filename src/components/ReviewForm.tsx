import { useState } from "react";
import { Star, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import type { Review } from "@/data/reviews";

const reviewSchema = z.object({
  author: z.string().trim().min(1, "Name is required").max(50, "Name must be under 50 characters"),
  comment: z.string().trim().min(5, "Review must be at least 5 characters").max(500, "Review must be under 500 characters"),
  rating: z.number().min(1, "Please select a rating").max(5),
});

interface ReviewFormProps {
  pharmacyId: string;
  onSubmit: (review: Review) => void;
}

const ReviewForm = ({ pharmacyId, onSubmit }: ReviewFormProps) => {
  const [author, setAuthor] = useState("");
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = reviewSchema.safeParse({ author, comment, rating });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const key = err.path[0] as string;
        fieldErrors[key] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const newReview: Review = {
      id: `user-${Date.now()}`,
      pharmacyId,
      author: result.data.author,
      rating: result.data.rating,
      date: new Date().toISOString().slice(0, 10),
      comment: result.data.comment,
    };

    onSubmit(newReview);
    setAuthor("");
    setComment("");
    setRating(0);
    toast.success("Thank you for your review!");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-border bg-secondary/30 p-5">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Leave a Review
      </h3>

      <div className="mt-4 space-y-4">
        {/* Star rating */}
        <div>
          <Label className="text-sm font-medium text-foreground">Your Rating</Label>
          <div className="mt-1.5 flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHoveredStar(i + 1)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => setRating(i + 1)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`h-6 w-6 ${
                    i < (hoveredStar || rating)
                      ? "fill-accent text-accent"
                      : "text-muted-foreground/30"
                  }`}
                />
              </button>
            ))}
          </div>
          {errors.rating && <p className="mt-1 text-xs text-destructive">{errors.rating}</p>}
        </div>

        {/* Name */}
        <div>
          <Label htmlFor="review-name" className="text-sm font-medium text-foreground">
            Your Name
          </Label>
          <Input
            id="review-name"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. Priya S."
            maxLength={50}
            className="mt-1.5"
          />
          {errors.author && <p className="mt-1 text-xs text-destructive">{errors.author}</p>}
        </div>

        {/* Comment */}
        <div>
          <Label htmlFor="review-comment" className="text-sm font-medium text-foreground">
            Your Review
          </Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience..."
            maxLength={500}
            rows={3}
            className="mt-1.5 resize-none"
          />
          <div className="mt-1 flex justify-between">
            {errors.comment ? (
              <p className="text-xs text-destructive">{errors.comment}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">{comment.length}/500</span>
          </div>
        </div>

        <Button type="submit" className="w-full sm:w-auto">
          <Send className="h-4 w-4" />
          Submit Review
        </Button>
      </div>
    </form>
  );
};

export default ReviewForm;
