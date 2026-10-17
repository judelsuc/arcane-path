terraform {
  required_version = ">= 1.7.0, < 2.0.0"

  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "= 3.4.0"
    }
  }
}

provider "openstack" {
  auth_url = "https://auth.cloud.ovh.net/v3"
  region   = "EU-WEST-PAR"
}

variable "create_server" {
  type        = bool
  default     = false
  description = "Opt in only after reviewing the current TTC cost and Terraform plan."
}

variable "ssh_public_key" {
  type        = string
  default     = ""
  description = "Public SSH key only. Never put a private key in Terraform."
}

variable "admin_ipv4_cidr" {
  type        = string
  default     = ""
  description = "Administrator IPv4 /32; no public application ingress is configured."

  validation {
    condition = var.admin_ipv4_cidr == "" || (
      can(cidrnetmask(var.admin_ipv4_cidr)) && endswith(var.admin_ipv4_cidr, "/32")
    )
    error_message = "Provide a single administrator IPv4 address with /32."
  }
}

locals {
  # OVH FR public catalogue on 2026-10-17: EUR 0.0512 HT/hour + 20% VAT.
  compute_monthly_ttc_eur = 0.06144 * 744
  other_services_reserve  = 10
}

resource "openstack_compute_keypair_v2" "preview" {
  count      = var.create_server ? 1 : 0
  name       = "arcane-path-preview"
  public_key = var.ssh_public_key

  lifecycle {
    precondition {
      condition     = startswith(var.ssh_public_key, "ssh-ed25519 ")
      error_message = "A public Ed25519 SSH key is required."
    }
  }
}

resource "openstack_compute_instance_v2" "preview" {
  count = var.create_server ? 1 : 0
  name  = "arcane-path-preview"
  # Region-specific public catalogue IDs verified by read-only API inventory.
  flavor_id       = "91fa3187-0f7d-489e-a75e-a7f6541482ee" # b3-8
  image_id        = "1b5478e4-7c1d-4abc-b227-c8a09d77be13" # Ubuntu 24.04
  key_pair        = openstack_compute_keypair_v2.preview[0].name
  security_groups = ["default"]
  user_data = templatefile("${path.module}/cloud-init.yaml", {
    admin_ipv4_cidr = var.admin_ipv4_cidr
  })

  network {
    uuid = "6d041167-5863-4cad-a165-d352bb6720ab" # Paris Ext-Net
  }

  metadata = {
    project    = "arcane-path"
    role       = "private-preview"
    managed_by = "terraform"
  }

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.admin_ipv4_cidr != ""
      error_message = "Host firewall requires an administrator IPv4 /32."
    }
    precondition {
      condition     = local.compute_monthly_ttc_eur + local.other_services_reserve <= 100
      error_message = "Estimated monthly TTC cost plus reserve exceeds EUR 100."
    }
  }
}

output "preview_ipv4" {
  value = var.create_server ? openstack_compute_instance_v2.preview[0].access_ip_v4 : null
}

output "compute_monthly_ttc_eur" {
  value = local.compute_monthly_ttc_eur
}

output "provisioning_enabled" {
  value = var.create_server
}
