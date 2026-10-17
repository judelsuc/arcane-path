mock_provider "openstack" {}

run "disabled_by_default" {
  command = plan
  variables {
    create_server = false
  }

  assert {
    condition     = length(openstack_compute_instance_v2.preview) == 0
    error_message = "Default plan must not provision a paid instance."
  }
}

run "approved_private_preview" {
  command = plan
  variables {
    create_server   = true
    ssh_public_key  = "ssh-ed25519 TEST_PUBLIC_KEY"
    admin_ipv4_cidr = "192.0.2.1/32"
  }

  assert {
    condition     = length(openstack_compute_instance_v2.preview) == 1
    error_message = "Only one CPU instance may be provisioned."
  }
  assert {
    condition     = openstack_compute_instance_v2.preview[0].security_groups == toset(["default"])
    error_message = "Use only the existing default group, without changing its rules."
  }

  assert {
    condition     = output.compute_monthly_ttc_eur < 50
    error_message = "Compute alone must remain below EUR 50 at the recorded tariff."
  }
}

run "reject_missing_firewall_source" {
  command = plan
  variables {
    create_server   = true
    ssh_public_key  = "ssh-ed25519 TEST_PUBLIC_KEY"
    admin_ipv4_cidr = ""
  }
  expect_failures = [openstack_compute_instance_v2.preview[0]]
}

run "reject_unrestricted_ssh" {
  command = plan
  variables {
    create_server   = false
    admin_ipv4_cidr = "0.0.0.0/0"
  }
  expect_failures = [var.admin_ipv4_cidr]
}

run "reject_missing_key" {
  command = plan
  variables {
    create_server   = true
    ssh_public_key  = ""
    admin_ipv4_cidr = "192.0.2.1/32"
  }
  expect_failures = [openstack_compute_keypair_v2.preview[0]]
}
