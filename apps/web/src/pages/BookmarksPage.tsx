import { Box, Card, IconButton, List, ListItemButton, ListItemText, Tooltip } from '@mui/material';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import { Link as RouterLink } from 'react-router-dom';
import { useSetBookmarkMutation } from '@/api/api';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/states';
import { useCurriculum, useProgressIndex } from '@/hooks/useCurriculum';

export const BookmarksPage = () => {
  const { index, error, isLoading, refetch } = useCurriculum();
  const { index: progress, isLoading: pLoading } = useProgressIndex();
  const [setBookmark] = useSetBookmarkMutation();
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || pLoading || !index) return <Loading />;

  const items = [...progress.bookmarks].map(id => index.lessons.get(id)).filter(l => !!l);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <PageHeader overline="Reference" title="Bookmarks" subtitle="Lessons you saved for revision." />
      {items.length === 0 ? (
        <EmptyState icon={<BookmarkBorderIcon fontSize="inherit" />} title="No bookmarks yet">
          Use the bookmark icon at the top of any lesson to save it here.
        </EmptyState>
      ) : (
        <Card>
          <List>
            {items.map(l => (
              <ListItemButton
                key={l!.id}
                component={RouterLink}
                to={`/learn/${l!.moduleId}/${l!.id}`}
                sx={{ pr: 8 }}
              >
                <ListItemText primary={l!.title} secondary={`${index.modules.get(l!.moduleId)?.title} · ${l!.minutes} min`} />
                <Tooltip title="Remove bookmark">
                  <IconButton
                    edge="end"
                    aria-label="Remove bookmark"
                    onClick={e => {
                      e.preventDefault();
                      setBookmark({ lessonId: l!.id, on: false });
                    }}
                    sx={{ position: 'absolute', right: 16 }}
                  >
                    <BookmarkIcon color="primary" />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))}
          </List>
        </Card>
      )}
    </Box>
  );
};
