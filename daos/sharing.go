package daos

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"time"

	"Threadr/logger"
	"Threadr/models"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func (d *DAO) CreateShareLink(ctx context.Context, link models.ShareLink) error {
	logger.Info("Creating share link",
		"token", link.Token,
		"storyId", link.StoryID,
		"authorEmail", link.AuthorEmail)

	item, err := attributevalue.MarshalMap(link)
	if err != nil {
		return fmt.Errorf("marshal share link: %w", err)
	}

	_, err = d.DynamoClient.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String("share_links" + GetTableSuffix()),
		Item:      item,
	})
	if err != nil {
		logger.Error("Failed to create share link",
			"error", err,
			"token", link.Token,
			"storyId", link.StoryID)
		return err
	}
	logger.Info("Share link created",
		"token", link.Token,
		"storyId", link.StoryID)
	return nil
}

func (d *DAO) GetShareLink(ctx context.Context, token string) (*models.ShareLink, error) {
	logger.Debug("Getting share link", "token", token)

	out, err := d.DynamoClient.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String("share_links" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"token": &types.AttributeValueMemberS{Value: token},
		},
	})
	if err != nil {
		logger.Error("Failed to get share link", "error", err, "token", token)
		return nil, err
	}
	if out.Item == nil {
		return nil, sql.ErrNoRows
	}

	var link models.ShareLink
	if err := attributevalue.UnmarshalMap(out.Item, &link); err != nil {
		return nil, fmt.Errorf("unmarshal share link: %w", err)
	}
	return &link, nil
}

func (d *DAO) GetShareLinksByAuthor(ctx context.Context, email string, storyID string) ([]models.ShareLink, error) {
	logger.Debug("Getting share links by author",
		"email", email,
		"storyId", storyID)

	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("share_links" + GetTableSuffix()),
		IndexName:              aws.String("author_email-index"),
		KeyConditionExpression: aws.String("author_email = :email"),
		FilterExpression:       aws.String("story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":email": &types.AttributeValueMemberS{Value: email},
			":sid":   &types.AttributeValueMemberS{Value: storyID},
		},
	})
	if err != nil {
		logger.Error("Failed to query share links by author",
			"error", err,
			"email", email,
			"storyId", storyID)
		return nil, err
	}

	var links []models.ShareLink
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &links); err != nil {
		return nil, fmt.Errorf("unmarshal share links: %w", err)
	}
	return links, nil
}

func (d *DAO) GetShareLinksByStory(ctx context.Context, storyID string) ([]models.ShareLink, error) {
	logger.Debug("Getting share links by story", "storyId", storyID)

	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("share_links" + GetTableSuffix()),
		IndexName:              aws.String("story_id-index"),
		KeyConditionExpression: aws.String("story_id = :sid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
		},
	})
	if err != nil {
		logger.Error("Failed to query share links by story",
			"error", err,
			"storyId", storyID)
		return nil, err
	}

	var links []models.ShareLink
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &links); err != nil {
		return nil, fmt.Errorf("unmarshal share links: %w", err)
	}
	return links, nil
}

func (d *DAO) RevokeShareLink(ctx context.Context, token string) error {
	logger.Info("Revoking share link", "token", token)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("share_links" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"token": &types.AttributeValueMemberS{Value: token},
		},
		UpdateExpression: aws.String("SET revoked = :r"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":r": &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	if err != nil {
		logger.Error("Failed to revoke share link", "error", err, "token", token)
		return err
	}
	logger.Info("Share link revoked", "token", token)
	return nil
}

func (d *DAO) RestoreShareLink(ctx context.Context, token string) error {
	logger.Info("Restoring share link", "token", token)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("share_links" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"token": &types.AttributeValueMemberS{Value: token},
		},
		UpdateExpression: aws.String("SET revoked = :r"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":r": &types.AttributeValueMemberBOOL{Value: false},
		},
	})
	if err != nil {
		logger.Error("Failed to restore share link", "error", err, "token", token)
		return err
	}
	logger.Info("Share link restored", "token", token)
	return nil
}

func (d *DAO) DeleteShareLink(ctx context.Context, token string) error {
	logger.Info("Deleting share link", "token", token)

	_, err := d.DynamoClient.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String("share_links" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"token": &types.AttributeValueMemberS{Value: token},
		},
	})
	if err != nil {
		logger.Error("Failed to delete share link", "error", err, "token", token)
		return err
	}
	logger.Info("Share link deleted", "token", token)
	return nil
}

func (d *DAO) CreateComment(ctx context.Context, comment models.Comment) error {
	logger.Info("Creating comment",
		"commentId", comment.CommentID,
		"shareToken", comment.ShareToken,
		"blockKeyId", comment.BlockKeyID)

	item, err := attributevalue.MarshalMap(comment)
	if err != nil {
		return fmt.Errorf("marshal comment: %w", err)
	}

	_, err = d.DynamoClient.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String("comments" + GetTableSuffix()),
		Item:      item,
	})
	if err != nil {
		logger.Error("Failed to create comment",
			"error", err,
			"commentId", comment.CommentID)
		return err
	}
	logger.Info("Comment created", "commentId", comment.CommentID)
	return nil
}

func (d *DAO) GetComment(ctx context.Context, commentID string) (*models.Comment, error) {
	logger.Debug("Getting comment", "commentId", commentID)

	out, err := d.DynamoClient.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String("comments" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"comment_id": &types.AttributeValueMemberS{Value: commentID},
		},
	})
	if err != nil {
		logger.Error("Failed to get comment", "error", err, "commentId", commentID)
		return nil, err
	}
	if out.Item == nil {
		return nil, sql.ErrNoRows
	}

	var comment models.Comment
	if err := attributevalue.UnmarshalMap(out.Item, &comment); err != nil {
		return nil, fmt.Errorf("unmarshal comment: %w", err)
	}
	return &comment, nil
}

func (d *DAO) GetCommentsByShareToken(ctx context.Context, shareToken string) ([]models.Comment, error) {
	logger.Debug("Getting comments by share token", "shareToken", shareToken)

	out, err := d.DynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String("comments" + GetTableSuffix()),
		IndexName:              aws.String("share_token-created_at-index"),
		KeyConditionExpression: aws.String("share_token = :st"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":st": &types.AttributeValueMemberS{Value: shareToken},
		},
	})
	if err != nil {
		logger.Error("Failed to query comments by share token",
			"error", err,
			"shareToken", shareToken)
		return nil, err
	}

	var comments []models.Comment
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &comments); err != nil {
		return nil, fmt.Errorf("unmarshal comments: %w", err)
	}
	return comments, nil
}

func (d *DAO) GetCommentsByStoryChapter(ctx context.Context, storyID, chapterID string) ([]models.Comment, error) {
	logger.Debug("Getting comments by story/chapter",
		"storyId", storyID,
		"chapterId", chapterID)

	input := &dynamodb.QueryInput{
		TableName:              aws.String("comments" + GetTableSuffix()),
		IndexName:              aws.String("story_id-chapter_id-index"),
		KeyConditionExpression: aws.String("story_id = :sid AND chapter_id = :cid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sid": &types.AttributeValueMemberS{Value: storyID},
			":cid": &types.AttributeValueMemberS{Value: chapterID},
		},
	}

	out, err := d.DynamoClient.Query(ctx, input)
	if err != nil {
		logger.Error("Failed to query comments by story/chapter",
			"error", err,
			"storyId", storyID,
			"chapterId", chapterID)
		return nil, err
	}

	var comments []models.Comment
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &comments); err != nil {
		return nil, fmt.Errorf("unmarshal comments: %w", err)
	}
	return comments, nil
}

func (d *DAO) ResolveComment(ctx context.Context, commentID string) error {
	logger.Info("Resolving comment", "commentId", commentID)

	_, err := d.DynamoClient.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String("comments" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"comment_id": &types.AttributeValueMemberS{Value: commentID},
		},
		UpdateExpression: aws.String("SET resolved = :r, resolved_at = :t"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":r": &types.AttributeValueMemberBOOL{Value: true},
			":t": &types.AttributeValueMemberN{Value: strconv.FormatInt(time.Now().Unix(), 10)},
		},
	})
	if err != nil {
		logger.Error("Failed to resolve comment", "error", err, "commentId", commentID)
		return err
	}
	logger.Info("Comment resolved", "commentId", commentID)
	return nil
}

func (d *DAO) DeleteComment(ctx context.Context, commentID string) error {
	logger.Info("Deleting comment", "commentId", commentID)

	_, err := d.DynamoClient.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String("comments" + GetTableSuffix()),
		Key: map[string]types.AttributeValue{
			"comment_id": &types.AttributeValueMemberS{Value: commentID},
		},
	})
	if err != nil {
		logger.Error("Failed to delete comment", "error", err, "commentId", commentID)
		return err
	}
	logger.Info("Comment deleted", "commentId", commentID)
	return nil
}
