'use client';

// UNUSED LEGACY COMPONENT — not imported anywhere in the app.
// Kept on disk per AGENT_CONTRACT.md rule 7 (nothing is deleted) rather than
// removed. It dates from the original India-focused template and still contains
// Indian content and pre-Pakistan assumptions, so it must NOT be mounted as-is:
// it would need localising (PKR, Pakistani names/districts, Urdu) first.

import { useState } from 'react';
import { Star, MessageSquare } from 'lucide-react';

interface RatingSystemProps {
  itemId: string;
  itemType: 'product' | 'expert' | 'consultation';
  currentRating?: number;
  onRatingSubmit?: (rating: number, review: string) => void;
  showReviews?: boolean;
}

export default function RatingSystem({ 
  itemId, 
  itemType, 
  currentRating = 0, 
  onRatingSubmit,
  showReviews = true 
}: RatingSystemProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  // Without an explicit element type this infers `never[]`, so every property
  // read on a review below is a type error.
  const [reviews, setReviews] = useState<
    { rating: number; review?: string; createdAt: string; user?: { name?: string } }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const handleRatingClick = (value: number) => {
    setRating(value);
    setShowReviewForm(true);
  };

  const submitRating = async () => {
    if (rating === 0) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          itemType,
          rating,
          review,
          userId: '507f1f77bcf86cd799439011'
        })
      });

      const data = await response.json();
      if (data.success) {
        onRatingSubmit?.(rating, review);
        setShowReviewForm(false);
        setReview('');
        fetchReviews();
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    try {
      const response = await fetch(`/api/ratings?itemId=${itemId}&itemType=${itemType}`);
      const data = await response.json();
      if (data.success) {
        setReviews(data.data);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  };

  const renderStars = (value: number, interactive = false) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => interactive && handleRatingClick(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            disabled={!interactive}
            className={`${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
          >
            <Star
              className={`w-5 h-5 ${
                star <= (interactive ? (hoverRating || rating) : value)
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Current Rating Display */}
      {currentRating > 0 && (
        <div className="flex items-center gap-2">
          {renderStars(currentRating)}
          <span className="text-sm text-gray-600">({currentRating}/5)</span>
        </div>
      )}

      {/* Interactive Rating */}
      <div>
        <h4 className="font-medium text-gray-900 mb-2">Rate this {itemType}</h4>
        {renderStars(0, true)}
      </div>

      {/* Review Form */}
      {showReviewForm && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Write a review (optional)
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Share your experience..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              rows={3}
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={submitRating}
              disabled={loading || rating === 0}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Rating'}
            </button>
            <button
              onClick={() => {
                setShowReviewForm(false);
                setRating(0);
                setReview('');
              }}
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reviews List */}
      {showReviews && reviews.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Reviews ({reviews.length})
          </h4>
          
          <div className="space-y-3">
            {reviews.map((review, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {renderStars(review.rating)}
                    <span className="font-medium text-gray-900">{review.user?.name || 'Anonymous'}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {review.review && (
                  <p className="text-gray-700 text-sm">{review.review}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}