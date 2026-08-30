import os
import sys
import json
import unittest

# Import Flask app instance
from app import app, get_quota_db

class TestMasterAdminAndUserManagement(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        # Initialize schema and seed default admins
        with get_quota_db() as conn:
            conn.execute("SELECT 1")

    def test_01_master_admin_login_and_full_access(self):
        # 1. Login as Master Admin (samuel-akinomolafe)
        res = self.app.post('/api/admin-login', json={
            "username": "samuel-akinomolafe",
            "password": "AdminPass1!Samuel"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertTrue(data.get("is_master"))

        # 2. Check session info via /api/admin/me
        res_me = self.app.get('/api/admin/me')
        self.assertEqual(res_me.status_code, 200)
        me_data = res_me.get_json()
        self.assertTrue(me_data.get("is_master"))
        self.assertFalse(me_data.get("is_restricted"))

        # 3. Master admin can access registrations
        res_reg = self.app.get('/api/admin/career-registrations')
        self.assertEqual(res_reg.status_code, 200)

        # 4. Master admin sees revenue in summary
        res_sum = self.app.get('/api/admin/summary')
        self.assertEqual(res_sum.status_code, 200)
        sum_data = res_sum.get_json()
        self.assertIsNotNone(sum_data.get("totalRevenueNgn"))

    def test_02_restricted_admin_access_restrictions(self):
        # 1. Login as Restricted Admin (oreoluwa-farodoye)
        res = self.app.post('/api/admin-login', json={
            "username": "oreoluwa-farodoye",
            "password": "AdminPass2!Oreoluwa"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertFalse(data.get("is_master"))

        # 2. Restricted admin blocked on registrations endpoint
        res_reg = self.app.get('/api/admin/career-registrations')
        self.assertEqual(res_reg.status_code, 403)

        # 3. Restricted admin summary hides revenue
        res_sum = self.app.get('/api/admin/summary')
        self.assertEqual(res_sum.status_code, 200)
        sum_data = res_sum.get_json()
        self.assertIsNone(sum_data.get("totalRevenueNgn"))
        self.assertEqual(sum_data.get("careerRegistrations"), 0)

        # 4. Restricted admin cannot register new admin
        res_add = self.app.post('/api/admin/team/register', json={
            "username": "test-admin", "password": "Pass123!Test",
            "name": "Test", "email": "test@nakconel.com", "role": "Dev"
        })
        self.assertEqual(res_add.status_code, 403)

    def test_03_master_admin_registers_and_manages_admins(self):
        # Login as Master Admin
        self.app.post('/api/admin-login', json={
            "username": "samuel-akinomolafe",
            "password": "AdminPass1!Samuel"
        })

        # Register a new admin
        res_reg = self.app.post('/api/admin/team/register', json={
            "username": "new-test-admin",
            "password": "NewAdminPass123!",
            "name": "New Test Admin",
            "email": "newadmin@nakconel.com",
            "role": "Content Designer",
            "role_level": "restricted"
        })
        self.assertEqual(res_reg.status_code, 200)
        self.assertTrue(res_reg.get_json().get("success"))

        # Deactivate new admin
        res_deact = self.app.post('/api/admin/team/new-test-admin/status', json={
            "is_active": 0
        })
        self.assertEqual(res_deact.status_code, 200)

        # Attempt login as deactivated admin should fail
        res_log_deact = self.app.post('/api/admin-login', json={
            "username": "new-test-admin",
            "password": "NewAdminPass123!"
        })
        self.assertEqual(res_log_deact.status_code, 403)

        # Reactivate new admin
        res_react = self.app.post('/api/admin/team/new-test-admin/status', json={
            "is_active": 1
        })
        self.assertEqual(res_react.status_code, 200)

        # Delete new admin
        res_del = self.app.delete('/api/admin/team/new-test-admin')
        self.assertEqual(res_del.status_code, 200)

    def test_04_registered_user_deactivation_and_activities(self):
        # Login as Master Admin
        self.app.post('/api/admin-login', json={
            "username": "samuel-akinomolafe",
            "password": "AdminPass1!Samuel"
        })

        test_uid = "TEST_USER_UID_1001"
        # Seed test user
        with get_quota_db() as conn:
            conn.execute(
                """INSERT INTO website_users (uid, email, username, photo_url, email_verified, is_deactivated, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 1, 0, '2026-08-30T00:00:00', '2026-08-30T00:00:00')
                   ON CONFLICT (uid) DO NOTHING""",
                (test_uid, "testuser@gmail.com", "Test User", "")
            )

        # Deactivate user for 7 days
        res_deact = self.app.post(f'/api/admin/users/{test_uid}/deactivate', json={
            "days": 7,
            "reason": "Suspicious login attempt"
        })
        self.assertEqual(res_deact.status_code, 200)
        self.assertTrue(res_deact.get_json().get("success"))

        # Fetch activities for user
        res_act = self.app.get(f'/api/admin/users/{test_uid}/activities')
        self.assertEqual(res_act.status_code, 200)
        acts = res_act.get_json().get("activities")
        self.assertGreater(len(acts), 0)

        # Reactivate user
        res_react = self.app.post(f'/api/admin/users/{test_uid}/reactivate')
        self.assertEqual(res_react.status_code, 200)

        # Delete user
        res_del = self.app.delete(f'/api/admin/users/{test_uid}')
        self.assertEqual(res_del.status_code, 200)

if __name__ == '__main__':
    unittest.main()
