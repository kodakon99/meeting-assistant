import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProjectsList } from './routes/ProjectsList'
import { NewProject } from './routes/NewProject'
import { ProjectDetail } from './routes/ProjectDetail'
import { NewMeeting } from './routes/NewMeeting'
import { SpeakerConfirmation } from './routes/SpeakerConfirmation'
import { DraftReview } from './routes/DraftReview'
import { TeamDashboard } from './routes/TeamDashboard'
import {
  PersonalDashboard,
  PersonalRedirect,
} from './routes/PersonalDashboard'
import { Dispatch } from './routes/Dispatch'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ProjectsList />} />
          <Route path="projects/new" element={<NewProject />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="projects/:id/meetings/new" element={<NewMeeting />} />
          <Route
            path="projects/:id/meetings/:meetingId/confirm"
            element={<SpeakerConfirmation />}
          />
          <Route
            path="projects/:id/meetings/:meetingId/draft"
            element={<DraftReview />}
          />
          <Route
            path="projects/:id/meetings/:meetingId/dispatch"
            element={<Dispatch />}
          />
          <Route path="projects/:id/team" element={<TeamDashboard />} />
          <Route path="projects/:id/me" element={<PersonalRedirect />} />
          <Route
            path="projects/:id/me/:participantId"
            element={<PersonalDashboard />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
